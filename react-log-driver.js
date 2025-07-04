/**
 * "react-log-driver"
 * Version: 0.6.0
 * License: Free Code License
 * Author: Dan Michael <dan@danmichael.consulting>, started early 2022
 * 
 * Requirements: For ReactJS running in web browsers, with 2 installed dependencies.
 * 
 * Use this to collect any amount of objects to send to your server.
 * Provide a persistent instance per key with a send function "sendFn" 
 * You drop a bunch of log(yourObject) into your components.
 * This tool will collect them all and send it to your servr every X seconds
 * It combines the best of ReactQuery and Jotai into your project.
 * 
 * Coming soon:
 *  - interval time to send, regardless how many objects are logged
 *  - complete useLogDriver
 *  - specify other time formats (optional dateFn?)
 * 
 * Thank you for using this!
 * 
 * 
 * Steps to use:
 * 1. Wrap your app in <QueryClientProvider>
 * 2. Deploy a main instance like this
 *      const eventLog = useLoggerSender(key, Promise, parameters)
 * 3. Log events throughout your app like this
 *      const eventLog = useLogger()
 *      eventLog.log({code: 'user_click', info: 'User clicked on X'})
 *      or like eventLog.run({code, info}, runYourClickFunctionToo())
 * 
 * Difference between mainInstance and simpleInstance
 *  - Main instances are more resource intensive components to run in your app.
 *      They will check() periodically for uploading if a sendFn is provided
 *  - Simple instances can log anything
 *      and they can send() if a sendFn is provided
 * 
 * Notes:
 *  - Your provided keys are case-sensitive
 *  - Two keys will be overidden in event objects: "time" & "info", with one always present even if not provided: "code"
 // const IdealEvent = {
 //     code: 'user_click', //this property not always present
 //     info: 'User clicked on button 1.', //this property not always present
 //     time: + new Date()/1000 //(we log this in Unix time)
 // }
 */

/**Import & Initialize dependencies (4) */
//
import { useCallback, useEffect, useState } from 'react'
import { useMutation, QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { Provider as JotaiProvider } from 'jotai'
//
const packageName = '@realdem/react-log-driver'
//


/**Display states & errors in the console? */
const debug = true
const consoleErrors = true



/**Configure defaults (3) */
//
const defaultKey = 'default'
const maxKeyLength = 1024
//
const defaultParam = {
    activeSending: true /* If the mainInstance sender should automatically send */,
    pendingSendMax: 5 /* Maximum logged objects */,
    timeInterval: 15000 /* Milliseconds */,
    prepFn: data => data
}
//
/**Defaults for an event log object */
const newLogStateDefaults = {
    key: defaultKey,
    pauseLogging: false,
    pauseSending: false,
    pendingSendMax: defaultParam.pendingSendMax,
    timeInterval: defaultParam.timeInterval,
    sendFn: null
}
//
const navigateToDefaults = {
    target: '_self',
    onlyTheseKeys: []
}


/* Helper functions (7) */

/**
 * Generate current timestamp
 * @param {string} format - The format to return the timestamp in
 * @returns {Date|number|string} The current timestamp
 */
const timestamp = (format = null) => {
    let date = new Date()
    if (!format) return date
    switch (format.toString().toLowerCase()) {
        case 'unix': return date/1000
        case 'string': return date.toString()
        case 'iso': return date.toISOString()
        default: return date
    }
}
//
/**Check if a variable is an object with keys */
const isObject = thisVariable => thisVariable instanceof Object && !Array.isArray(thisVariable)
//
/**
 * Takes provided key and returns a usable string
 * @param {*} key
 * @returns {string}
 */
function sanitizeRawKey(key) {
    switch (typeof key) {
        case 'string':
        case 'number':
        case 'bigint':
        case 'boolean': return `${key}`.slice(0, maxKeyLength) || defaultKey
        case 'object': return Array.isArray(key)? key.map(sanitizeRawEvent).join(',').slice(0, maxKeyLength) : defaultKey
        default: return defaultKey
    }
}
//
/**Check if provided function is asynchronous */
const isPromiseOrAsyncFunc = whatever => Boolean(whatever && ['[object Promise]', '[object AsyncFunction]'].includes(Object.prototype.toString.call(whatever)))
//
const sanitizeRawEvent = (event = undefined) => 
    isObject(event)? event 
    : ['string', 'number', 'boolean'].includes(typeof event)? 
        ({
            code: event
        }) 
        : ({
            code: 'unknown', 
            info: ['bigint'].includes(typeof event)? `${event}` : null
        })
//
const addEventMetadata = event => ({
    metadata: {
        /**Ensure any user-provided metadata is still being included in the log */
        ...event.metadata === undefined? {} : isObject(event.metadata)? event.metadata : {metadata: event.metadata},
        time: timestamp(),
        timeUnix: timestamp('unix'),
        timeISO: timestamp('iso'),
        path: window.location.pathname,
        href: window.location.href,
        userId: null
    },
    data: null,
    ...event
})
//
/**For partitioning event logs logically */
const generateEventLogAtomKey = (key = defaultKey, logNormal = true) => `${packageName}:${key}:${logNormal? 'normal' : 'temp'}`
//
/**Create a log object */
const newLogState = param => ({
    ...newLogStateDefaults,
    ...isObject(param)? param : ['string', 'number', 'bigint'].includes(typeof param)? {key: sanitizeRawEvent(param)} : {}
})


/**The jotai atoms (9) */
//
/**Instances of log batch senders which look over multiple Log key's */
const logDriversAtom = atom([])
//
/**Store all keys here */
const eventLogsAtom = atom([])
//
/**Keys of event logs not to send */
const eventLogsPausedAtom = atom([])
//
/**Store objects here (intending logged events) */
const eventLogPendingSendAtomFamily = atomFamily(() => atom([]))
//
/**Derived atom for adding event keys */
const eventLogKeyAdderAtom = atom(
    null,
    (get, set, keys = [defaultKey]) => {
        const current = get(eventLogsAtom)
        set(eventLogsAtom, [...new Set([...current, ...keys])])
    }
)
//
/**Derived atom for adding events to pending send */
const eventLogPendingAdderAtomFamily = atomFamily((key = defaultKey) => 
    atom(
        (get) => get(eventLogPendingSendAtomFamily(key)),
        (get, set, eventProvided) => {
            const current = get(eventLogPendingSendAtomFamily(key))
            set(eventLogPendingSendAtomFamily(key), [
                ...current,
                addEventMetadata(sanitizeRawEvent(eventProvided))
            ])
        }
    )
)
//
/**Derived atom for log driver commands */
const eventLogDriverAtom = atom(
    null,
    (get, set, param) => {
        if (debug) console.info(packageName, 'eventLogDriverAtom.set()', param)
        switch (param.type) {
            case 'jam':
                const current = get(eventLogsPausedAtom)
                set(eventLogsPausedAtom, [...new Set([...current, ...param.keys])])
                break;
            default: break;
        }
    }
)
//
/**Derived atom for clearing event logs */
const eventLogClearerAtom = atom(
    null,
    (get, set, key = undefined) => {
        if (debug) console.log(packageName, 'eventLogClearerAtom', key)
        if (typeof key === 'string' && key.length > 0) {
            set(eventLogPendingSendAtomFamily(generateEventLogAtomKey(key, true)), [])
            set(eventLogPendingSendAtomFamily(generateEventLogAtomKey(key, false)), [])
        }
    }
)
//
/**Derived atom for getting logs by keys */
const eventLogsGetterAtomFamily = atomFamily((logKeys = []) => 
    atom((get) => 
        logKeys.reduce((all, key) => ({
            ...all,
            [key]: [
                ...get(eventLogPendingSendAtomFamily(generateEventLogAtomKey(key))),
                ...get(eventLogPendingSendAtomFamily(generateEventLogAtomKey(key, false)))
            ]
        }), {})
    )
)


/* The hooks (2) */
//
/**For performing operations only on existing event logs */
const useReduceToExistingKeysSelector = () => {
    const logsState = useAtomValue(eventLogsAtom)
    /**
     * TODO: Event Log State Storage Enhancement
     * Current Implementation:
     * - Event logs are stored as simple strings/primitives
     * - The .key property fallback is used for backward compatibility
     * 
     * Planned Enhancement:
     * - Store event logs as structured objects with consistent schema
     * - Schema: {
     *     key: string,           // Unique identifier for the log
     *     type: string,          // Type of log (e.g., 'error', 'info', 'warning')
     *     timestamp: number,     // Unix timestamp
     *     metadata: Object,      // Additional contextual data
     *     data: any             // The actual log content
     * }
     * 
     * Migration Steps:
     * 1. Update atomFamily to store objects instead of primitives
     * 2. Add migration logic for existing log entries
     * 3. Update all log creation points to use new object structure
     * 4. Remove the .key || thisLog fallback after migration
     */
    return (checkKeys = []) => [defaultKey, ...(Array.isArray(checkKeys)? checkKeys.map(sanitizeRawEvent) : [sanitizeRawEvent(checkKeys)])].reduce((existingKeys, thisKey) => logsState.map(thisLog => thisLog.key || thisLog).includes(thisKey)? [...existingKeys, thisKey] : existingKeys, [])
}
//
export default function useLoggerSender(keyOrSendFn = undefined, paramOrSendFn = undefined, paramObject = undefined) {
    let errors = []
    
    /**Cleanup arguments & parameters here */
    let paramProvided = isObject(paramOrSendFn)? paramOrSendFn 
        : isObject(paramObject)? paramObject 
        : false
    let param = {
        ...defaultParam,
        ...paramProvided || {}
    }
    //
    let key = sanitizeRawKey(typeof keyOrSendFn === 'string'? keyOrSendFn : `${param.key || ''}` || defaultKey)
    /**Make sure key exists */
    const eventLogKeyAdder = useSetAtom(eventLogKeyAdderAtom)
    eventLogKeyAdder([key])
    //
    let sendFn = isPromiseOrAsyncFunc(keyOrSendFn)? keyOrSendFn 
        : isPromiseOrAsyncFunc(paramOrSendFn)? paramOrSendFn
        : !!paramProvided && ('sendFn' in paramProvided) && isPromiseOrAsyncFunc(paramProvided.sendFn)? paramProvided.sendFn
        : undefined
    //
    /**Tell the developer that the sendFn needs to be asynchronous */
    if (
        (typeof keyOrSendFn === 'function' && !isPromiseOrAsyncFunc(keyOrSendFn))
        && (typeof paramOrSendFn === 'function' && !isPromiseOrAsyncFunc(paramOrSendFn))
    ) errors.push({
        code: 'SENDFN_NOT_A_PROMISE',
        msg: 'A sendFn was defined to useLoggerSender() but it is not asynchronous '
    })


    /**Determine if this is the main instance hook that is called within the app */
    const mainInstance = (
        sendFn !== undefined || (('mainInstance' in param) && Boolean(param.mainInstance))
    ) && (!('simpleInstance' in param) || !Boolean(param.simpleInstance))
    /**Determine if this is a mainInstance that sends */
    const mainInstanceSends = mainInstance && sendFn !== undefined
    
    /**React-Query mutation for sending simplicity */
    const sender = !mainInstanceSends? null : useMutation({
        mutationKey: [packageName, key, 'event-log-send'],
        ...mainInstanceSends? {mutationFn: sendFn} : {}
    })
    //
    /**Normally we log events into an array, but when we are sending the array, we need a temporary array to store events while the server is accepting the current batch. */
    let useNormalLog = !!sender && !sender.isLoading
    

    /**Separate functions for setting atom w/n an atomFamily */
    const logNormal = useSetAtom(eventLogPendingAdderAtomFamily(generateEventLogAtomKey(key, true)))
    const logTemp = useSetAtom(eventLogPendingAdderAtomFamily(generateEventLogAtomKey(key, false)))
    //
    /**When the event-log is sending, we store new events in a temporary array state */
    let logEvent = event => useNormalLog? logNormal(event) : logTemp(event)
    //
    /**Either logs the event immediately or returns a function to call that will log the event & simultaneously run a provided function
     * The returned function can essentially act as a cloned event, where you may pass additional maybe-unique 'info' to any of those clones.
    */
    let log = (event = null, fnOrReturnFn = undefined, returnFn = false) => {
        let runFn = typeof fnOrReturnFn === 'function'? fnOrReturnFn : false
        let run = (moreEventInfo = undefined) => {
            logEvent({
                ...sanitizeRawEvent(event), 
                ...typeof moreEventInfo === undefined? {} 
                    : isObject(moreEventInfo)? moreEventInfo
                    : {info: moreEventInfo}
            })
            if (!!runFn) runFn()
        }
        return ['boolean', 'null', 'number', 'string'].includes(typeof fnOrReturnFn) && Boolean(fnOrReturnFn)
        || ['boolean', 'null', 'number', 'string'].includes(typeof returnFn) && Boolean(returnFn)
        ? run : run()
    }


    //
    //
    //
    /**This hook can be simple or high-level, depending on if a Promise is provided as first argument */
    if (!mainInstance) {
        if (consoleErrors) errors.forEach(console.error)
        return log
    }
    //
    //
    //

    
    const [eventsNormal, setEventsNormal] = useAtom(eventLogPendingSendAtomFamily(generateEventLogAtomKey(key)))
    const eventsTemp = useAtomValue(eventLogPendingSendAtomFamily(generateEventLogAtomKey(key, false)))
    const clearNormal = () => setEventsNormal([])
    const clearTemp = useSetAtom(eventLogPendingSendAtomFamily(generateEventLogAtomKey(key, false)))
    
    /**The user may retrieve everything */
    let events = [...eventsNormal, ...eventsTemp]
    
    /**The user may clear everything */
    let clear = () => (clearNormal() || clearTemp([]))

    /* Sends & Clears the event log */
    const onSuccess = ({success}) => success && (setEventsNormal(eventsTemp) || clearTemp())
    /**DEV_REMINDER how does this function get called? */
    /**
     * Send Function Call Flow
     * ----------------------
     * The send function is called in three scenarios:
     * 
     * 1. Automatic Batch Send:
     *    - When eventsNormal.length >= param.pendingSendMax
     *    - Triggered by the check() function in useEffect
     * 
     * 2. Time-based Send:
     *    - When timeInterval is set and time has elapsed
     *    - Managed by setInterval in useEffect
     * 
     * 3. Manual Send:
     *    - When user explicitly calls send()
     *    - Can override normal logic with overrideLogic=true
     * 
     * Implementation Details:
     * - Uses React Query's useMutation for server communication
     * - Temporary storage (eventsTemp) holds new logs during sending
     * - On successful send, temp logs are moved to normal storage
     * 
     * @param {boolean} overrideLogic - Force send regardless of conditions
     * @returns {Promise|boolean} - Returns false if conditions not met, otherwise Promise
     */
    const send = mainInstanceSends? 
        (overrideLogic = false) => 
            (overrideLogic || (param.activeSending && !sender.isLoading)) 
            && sender.mutate(param.prepFn(eventsNormal), {onSuccess})
        : (useSendFn = null, prepFn = null) => 
            !isPromiseOrAsyncFunc(useSendFn)? false 
            : sender.mutate(typeof prepFn === 'function'? prepFn(eventsNormal) : param.prepFn(eventsNormal), {
                mutationFn: useSendFn,
                onSuccess
            })

    
    /**Check & Send */
    function check() {
        if (mainInstanceSends)
            if (!Boolean(param.timeIntervalSeconds)) {
                if (eventsNormal.length >= param.pendingSendMax) send(false)
            }// else if (eventsNormal.length > 0 && timeRemaining < 0) send(true)
    }
    if (mainInstanceSends) useEffect(check, [`${eventsNormal.length}:${events[eventsNormal.length-1]?.time}`])
    //
    /**Check every so often? */
    const [intervalId, setIntervalId] = useState(null)
    if (mainInstanceSends) useEffect(() => {
        if (Boolean(param.timeInterval) && intervalId === null) setIntervalId(setInterval(check, param.timeInterval))
        return () => clearInterval(intervalId)
    }, [])

    /**For an external link that breaks the webapp;
     * Send all logs that can be sent, before the webapp unloads
     */
    /**
     * Default configuration for external navigation links
     * 
     * TODO: ID Generation Enhancement
     * Current Implementation:
     * - ID field is empty string, needs unique identifier generation
     * 
     * Planned Enhancement:
     * - Add UUID generation for unique link tracking
     * - Schema: {
     *     id: string,            // UUID v4 for unique identification
     *     title: string,         // Link title for accessibility
     *     className: string,     // CSS classes for styling
     *     href: string,          // Target URL
     *     rel: string,           // Link relationship
     *     target: string,        // Target window/frame
     *     text: string|null,     // Link text content
     *     download: boolean      // Download attribute flag
     * }
     * 
     * Implementation Steps:
     * 1. Add UUID v4 generation utility function
     * 2. Generate ID on link creation
     * 3. Use ID for tracking link interactions
     * 4. Add link click analytics integration
     */
    const navigateOrLinkToDefaults = {
        id: '', //DEV_REMINDER something very random
        title: '',
        className: '',
        href: '#',
        rel: 'noreferrer',
        target: '',
        text: null,
        download: false
    }
    //
    /**
     * Send all pending logs for specified keys
     * 
     * TODO: Complete sendAll Implementation
     * Current Implementation:
     * - Function stub with error message
     * 
     * Planned Enhancement:
     * - Implement batch sending of logs across multiple keys
     * - Support for selective key sending
     * 
     * Implementation Steps:
     * 1. Gather logs from specified keys:
     *    - If onlyTheseKeys is empty, use all available keys
     *    - Filter logs by provided keys if specified
     * 
     * 2. Batch Processing:
     *    - Group logs by key for efficient processing
     *    - Handle temporary storage during sending
     *    - Manage concurrent sends with Promise.all
     * 
     * 3. Error Handling:
     *    - Implement retry logic for failed sends
     *    - Track partial success/failure
     *    - Maintain failed logs for retry
     * 
     * 4. Success Handling:
     *    - Clear sent logs from storage
     *    - Update UI with send status
     *    - Trigger success callbacks
     * 
     * @param {string[]} onlyTheseKeys - Optional array of keys to limit sending
     * @returns {Promise<Object>} Results of send operations by key
     */
    const sendAll = (onlyTheseKeys = []) => {
        // DEV_REMINDER
        console.error('Function not complete yet // 2023-01-14')
        // each log, send out all normal & temp logs
        // when finished, send to param
    }
    //
    /**Navigate to a link after sending all logs.
     * This function will send all logs, then open the link in a new tab.
     * If the user does not provide a...
     * link: it will use the defaults
     * target: it will use the defaults
     * onlyTheseKeys: it will use the defaults
     * ...then it will send all logs for the provided keys
     * and open the link in a new tab.
     * @param {string} href - The link to navigate to
     * @param {object} param - The parameters for the navigation
     * @returns {Promise} A promise that resolves when the navigation is complete
     */
    let navigateTo = (href, param = {}) => {
        param = {...navigateToDefaults, ...param}
        let runFunc = new Promise(resolve => {
            sendAll(param.onlyTheseKeys)
            resolve()
        })
        return runFunc.then(() => window.open(href || navigateOrLinkToDefaults.href, param.target))
    }
    /**Produce an <a> link that navigates after sending */
    let LinkTo = ({href, rel, target, title, id, className, text, children, download}) => {
        href = href || navigateOrLinkToDefaults.href
        rel = rel || navigateOrLinkToDefaults.rel
        target = target || navigateOrLinkToDefaults.target
        title = title || navigateOrLinkToDefaults.title
        id = id || navigateOrLinkToDefaults.id
        className = className || navigateOrLinkToDefaults.className
        text = text || navigateOrLinkToDefaults.text
        download = download || navigateOrLinkToDefaults.download
        const onClick = useCallback(e => {
            e.preventDefault()
            navigateTo(href, {target})
        }, [href, target])
        return <a {...{href, rel, target, title, id, className, onClick, download}}>{children || text || href}</a>
    }

    /**Return methods for the user to control some aspects */
    if (consoleErrors) errors.forEach(console.error)
    return {
        log,
        check,
        send,
        navigateTo,
        LinkTo,
        clear,
        events,
        errors
    }
}
//
/**A simplified instance (not main instance) which only logs from app components, without subscribing to the log state. */
export const useLogger = (key = undefined) => useLoggerSender(key)


/**
 * Have instances of log batch senders which look over multiple Log key's
 * 
 * TODO: Interval Setting Enhancement
 * Current Implementation:
 * - Basic interval checking through useEffect
 * - Fixed interval timing
 * 
 * Planned Enhancement:
 * - Dynamic interval configuration
 * - Per-key interval settings
 * - Adaptive interval based on log volume
 * 
 * Configuration Options:
 * @typedef {Object} IntervalConfig
 * @property {number} baseInterval - Base interval in milliseconds
 * @property {number} minInterval - Minimum interval allowed
 * @property {number} maxInterval - Maximum interval allowed
 * @property {Object} keyIntervals - Per-key custom intervals
 * @property {boolean} adaptiveMode - Enable/disable adaptive timing
 * @property {Object} adaptiveConfig - Configuration for adaptive timing
 * 
 * Implementation Steps:
 * 1. Add interval configuration to options object
 * 2. Implement interval management system
 * 3. Add per-key interval override capability
 * 4. Develop adaptive interval algorithm
 * 5. Add interval adjustment based on:
 *    - Log volume
 *    - Network conditions
 *    - Server response times
 * 
 * @param {Object} options - Configuration options including interval settings
 * @returns {Object} The log batch sender instance
 */
export function useLogDriver(options = {}) {
    const logDrive = useSetAtom(eventLogDriverAtom)
    //
    const [eventLogsPaused, setEventLogsPaused] = useAtom(eventLogsPausedAtom)
    const resetEventLogsPaused = () => setEventLogsPaused([])
    if (debug) console.info(packageName, 'eventLogsPaused', eventLogsPaused)
    //
    const eventLogClearerReset = useSetAtom(eventLogClearerAtom)
    //
    /**All keys in the system */
    const [logKeys, setLogKeys] = useAtom(eventLogsAtom)
    if (debug) console.info(packageName, 'logKeys', logKeys)
    //
    const reduceToExistingKeys = useReduceToExistingKeysSelector()
    //
    let keys = logKeys//logs.map(({key}) => key)
    //
    const [allLogDriverKeys, setAllLogDriverKeys] = useAtom(logDriversAtom)
    if (debug) console.info(packageName, 'allLogDriverKeys', allLogDriverKeys)
    //

    let driveTheseKeys = !options.keys ? (logKeys.length > 0 ? logKeys : [defaultKey])
        : typeof options.keys === 'string' ? [options.keys]
        : Array.isArray(options.keys) ? options.keys
        : [defaultKey]
    if (debug) console.info(packageName, 'driveTheseKeys', driveTheseKeys)
    
    /**Add any missing keys to all keys */
    let missingLogKeys = driveTheseKeys.reduce((missing, key) => logKeys.includes(key)? missing : [...missing, key], [])
    useEffect(() => {
        if (missingLogKeys.length > 0) setLogKeys(allLogKeys => [...allLogKeys, ...missingLogKeys])
    }, [missingLogKeys.join(',')])

    /**Add any missing keys to all log-driver keys */
    let missingLogDriverKeys = driveTheseKeys.reduce((missing, key) => allLogDriverKeys.includes(key)? missing : [...missing, key], [])
    useEffect(() => {
        if (missingLogDriverKeys.length > 0) setAllLogDriverKeys(allLogDriverKeys => [...allLogDriverKeys, ...missingLogDriverKeys])
    }, [missingLogDriverKeys.join(',')])

    /**Control all collected events over all keys */
    let clear = (clearTheseLogs = []) => {
        /**Delete all event logs for all keys */
        if (clearTheseLogs.length > 0) clearTheseLogs.forEach(eventLogClearerReset)
        /**Else only clear */
        else driveTheseKeys.forEach(eventLogClearerReset)
    }

    /**Dam the river.
     * This is useful if the App wants to temporarily cut off adding more into memory or onto its network requests.
     * You can even deactivate log sending for log-keys that you haven't specified the driver to look after.
     */
    let jam = (
        deactivate = allLogDriverKeys,
        prevent = ['logging', 'sending']
    ) => logDrive({
        type: 'jam', 
        keys: typeof deactivate === 'boolean'? !deactivate? [] : allLogDriverKeys.length > 0? allLogDriverKeys : logKeys
            : Array.isArray(deactivate)? reduceToExistingKeys(deactivate.map(sanitizeRawKey))
            : reduceToExistingKeys([sanitizeRawKey(deactivate)]),
        prevent
    })

    /**Sending
     * DEV_REMINDER
     */
    const sendFn = null
    const sendAll = () => {}
    
    /**If the user "logs out" and all events should be deactivated and cleared*/
    let logout = (unloadAll = false) => {
        if (unloadAll) {
            /**Send all logs  */
            if (sendFn) sendAll()
        } else {
            /**All events for all event log keys end */
            jam(true)
            clear()
        }
    }
    
    /**Tell the driver the log uploading or logging can continue
     */
    let drive = (unpauseTheseKeys = []) => {
        /**First, clean up the parameter */
        unpauseTheseKeys = sanitizeRawKey(unpauseTheseKeys)
        //
        // if (['string', 'number', 'bigint'].includes(typeof unpauseTheseKeys) && unpauseTheseKeys.length > 0) unpauseTheseKeys = [`${unpauseTheseKeys}`]
        // else if (!Array.isArray(unpauseTheseKeys)) unpauseTheseKeys = []
        //
        /**If none provided, un-pause all event log keys */
        if (unpauseTheseKeys.length === 0) resetEventLogsPaused()
        /**Else remove only the specified keys from beign paused */
        else setEventLogsPaused(eventLogsPaused.reduce((all, pausedLog) => unpauseTheseKeys.includes(pausedLog)? all : [...all, pausedLog], []))
    }

    /**
     * TODO: useLoggerSender Integration
     * Current Implementation:
     * - Basic comment noting need for useLoggerSender capabilities
     * - No actual integration implemented
     * 
     * Planned Enhancement:
     * - Full integration of useLoggerSender functionality within useLogDriver
     * - Unified logging and sending interface
     * 
     * Integration Components:
     * 1. Logging Capabilities:
     *    - Direct log creation and management
     *    - Batch logging support
     *    - Log formatting and sanitization
     * 
     * 2. Sending Features:
     *    - Automatic batch sending
     *    - Manual send triggers
     *    - Custom send intervals
     * 
     * 3. State Management:
     *    - Log state tracking
     *    - Send status monitoring
     *    - Error handling
     * 
     * 4. Configuration:
     *    - Merged options handling
     *    - Per-instance settings
     *    - Global defaults
     * 
     * Implementation Steps:
     * 1. Extract core useLoggerSender functionality
     * 2. Adapt for useLogDriver context
     * 3. Implement state sharing
     * 4. Add configuration merging
     * 5. Test integrated functionality
     */
    // const loggerSender = useLoggerSender(options.sendFn || null, {})

    /**Object of all logs by key >> Array of each's events */
    const logs = useAtomValue(eventLogsGetterAtomFamily(driveTheseKeys))
    
    return {
        logs,
        keys: driveTheseKeys,
        jam,
        jammed: eventLogsPaused,
        drive,
        driving: driveTheseKeys.filter(key => !eventLogsPaused.includes(key)),
        clear,
        logout,
        // reset
        // loggerSender
    }
}


/**
 * Wrap the application in a LogRiver component
 * @param {QueryClient} props.queryClient - An instance of QueryClient
 * @param {ReactNode} props.children - The application to wrap
 * @returns {ReactNode} The wrapped application
 * */
export const LogRiver = ({children, queryClient = null}) => {
    /**Allow the user to submit their own queryClient */
    const userProvidedQueryClient = isObject(queryClient)
        && ('constructor' in queryClient)
        && ('name' in queryClient.constructor)
        && queryClient.constructor.name === 'QueryClient'
    //
    if (debug) console.info(packageName, '<LogRiver> userProvidedQueryClient', userProvidedQueryClient)
    //
    if (!userProvidedQueryClient) queryClient = new QueryClient({
        defaultOptions: {
            mutations: {
                staleTime: Infinity,
                onError: console.error
            }
        }
    })

    return <JotaiProvider>
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    </JotaiProvider>
}