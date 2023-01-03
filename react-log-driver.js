/**
 * "react-log-driver"
 * Version: 0.5.03
 * License: MIT
 * Author: Dan Michael <dan@danmichael.consulting>, started mid 2022
 * 
 * Requirements: For ReactJS running in web browsers, with 2 installed dependencies.
 * 
 * Use this to collect any amount of objects to send to your server.
 * Provide a persistent instance per key with a send function "sendFn" 
 * //DEV_REMINDER: Coming soon Otherwise provide  a persistent "driver" with sets of keys to upload.
 * You drop a bunch of log(yourObject) into your components.
 * This tool will collect them all and send it to your servr every X seconds
 * It combines the best of ReactQuery and Recoil into your project.
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
 * 1. Wrap your app in <RecoilRoot> and <QueryClientProvider>
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
 *  - Two keys will be overidden in event objects: "time" & "info", with one always present even if not provided: "code"
 // const IdealEvent = {
 //     code: 'user_click', //this property not always present
 //     info: 'User clicked on button 1.', //this property not always present
 //     time: + new Date()/1000 //(we log this in Unix time)
 // }
 */

/**Import & Initialize dependencies (4) */
//
import { useEffect, useState } from 'react'
import { useMutation } from 'react-query'
import { atom, atomFamily, selector, selectorFamily, useRecoilState, useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil'
const packageName = 'react-log-driver'
//



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


/* Helper functions (5) */
//
/**Takes provided key and returns a usable string */
function sanitizeRawKey(key) {
    switch (typeof key) {
        case 'string':
        case 'number':
        case 'bigint':
        case 'boolean':
            return `${key}`.slice(0, maxKeyLength) || defaultKey
        case 'array':
            return key.join(',').slice(0, maxKeyLength) || defaultKey
        default:
            return defaultKey
    }
}
//
const isPromise = whatever => typeof whatever === 'function' /*DEV_REMINDER: Need to determine if is a promise */
//
const sanitizeRawEvent = (event = undefined) => 
    typeof event === 'object'? event 
    : ['string', 'number', 'boolean'].includes(typeof event)? 
        ({
            code: event
        }) 
        : ({
            code: 'unknown', 
            info: ['bigint'].includes(typeof event)? `${event}` : null
        })
//
const addTimeToEvent = event => ({
    ...event,
    time: + new Date()/1000
})
//
/**For partitioning event logs logically */
const generateEventLogAtomKey = (key = defaultKey, logNormal = true) => `${packageName}:${key}:${logNormal? 'normal' : 'temp'}`


/**The recoil (5) */
//
/**Instances of log batch senders which look over multiple Log key's */
const logDriversState = atom({
    key: packageName+':logDrivers',
    default: []
})
//
/**Store all keys here */
const eventLogsState = atom({
    key: packageName+'eventLogs',
    default: []
})
//
/**Store objects here (intending logged events) */
const eventLogPendingSendState = atomFamily({
    key: packageName+':eventLogPendingSend',
    default: []
})
//
/**Handle the stored objects here */
const eventLogPendingSendSelector = selectorFamily({
    key: packageName+':eventLogPendingSendSelector',
    get: (key = defaultKey) => ({get}) => get(eventLogPendingSendState(key)),
    set: (key = defaultKey) => ({get, set}, eventProvided) => {
        // recordKeyHere
        set(eventLogPendingSendState(key), [
            ...get(eventLogPendingSendState(key)), 
            addTimeToEvent(sanitizeRawEvent(eventProvided))
        ])
    }
})
//
/**Handle log driver commands */
const eventLogDriverSelector = selector({
    key: packageName+':eventLogDriverSelector',
    get: ({get}) => get(),
    set: ({get, set}, keys = []) => {}
})


/* The hooks (2) */
//
export default function useLoggerSender (keyOrSendFn = undefined, paramOrSendFn = undefined, paramObject = undefined) {
    let errors = []
    
    /**Cleanup arguments & parameters here */
    let paramProvided = typeof paramOrSendFn === 'object'? paramOrSendFn 
        : typeof paramObject === 'object'? paramObject 
        : false
    let param = {
        ...defaultParam,
        ...paramProvided || {}
    }
    //
    let key = sanitizeRawKey(`${keyOrSendFn}` || `${param.key || ''}` || defaultKey)
    //
    let sendFn = isPromise(keyOrSendFn)? keyOrSendFn 
        : isPromise(paramOrSendFn)? paramOrSendFn
        : !!paramProvided && ('sendFn' in paramProvided) && isPromise(paramProvided.sendFn)? paramProvided.sendFn
        : undefined


    /**Determine if this is the main instance hook that is called within the app */
    const mainInstance = (
        sendFn !== undefined || (('mainInstance' in param) && Boolean(param.mainInstance))
    ) && (!('simpleInstance' in param) || !Boolean(param.simpleInstance))
    /**Determine if this is a mainInstance that sends */
    const mainInstanceSends = mainInstance && sendFn !== undefined


    /**React-Query mutation for sending simplicity */
    const sender = useMutation({
        mutationKey: [packageName, key, 'event-log-send'],
        ...mainInstanceSends? {mutationFn: sendFn} : {}
    })
    //
    /**Normally we log events into an array, but when we are sending the array, we need a temporary array to store events while the server is accepting the current batch. */
    let useNormalLog = !sender.isLoading
    

    /**Separate functions for setting atom w/n an atomFamily via a selectorFamily */
    const logNormal = useSetRecoilState(eventLogPendingSendSelector(generateEventLogAtomKey(key, true)))
    const logTemp = useSetRecoilState(eventLogPendingSendSelector(generateEventLogAtomKey(key, false)))
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
                    : typeof moreEventInfo === 'object'? moreEventInfo
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
    if (!mainInstance) return log
    //
    //
    //

    
    const [eventsNormal, setEventsNormal] = useRecoilState(eventLogPendingSendState(generateEventLogAtomKey(key)))
    const clearNormal = useResetRecoilState(eventLogPendingSendState(generateEventLogAtomKey(key)))
    const eventsTemp = useRecoilValue(eventLogPendingSendState(generateEventLogAtomKey(key, false)))
    const clearTemp = useResetRecoilState(eventLogPendingSendState(generateEventLogAtomKey(key, false)))
    
    /**The user may retrieve everything */
    let events = [...eventsNormal, ...eventsTemp]
    
    /**The user may clear everything */
    let clear = () => (clearNormal() || clearTemp())

    /* Sends & Clears the event log */
    const onSuccess = ({success}) => success && (setEventsNormal(eventsTemp) || clearTemp())
    const send = mainInstanceSends? 
        (overrideLogic = false) => 
            (overrideLogic || (param.activeSending && !sender.isLoading)) 
            && sender.mutate(param.prepFn(eventsNormal), {onSuccess})
        : (useSendFn = null, prepFn = null) => 
            !isPromise(useSendFn)? false 
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


    /**Return methods for the user to control some aspects */
    return {
        log,
        check,
        send,
        clear,
        events,
        errors
    }
}
//
/**A simplified instance (not main instance) which only logs from app components, without subscribing to the log state. */
export const useLogger = (key = undefined) => useLoggerSender(key)
//
/**Log an event with any logKey. It performs heavier than useLogger does. */
export function log(...args) {
    return useLogger(args[0])(
        args[1] || undefined,
        args[2] || undefined,
        args[3] || undefined
    )
}


/**Have instances of log batch senders which look over multiple Log key's */
//
export function useLogDriver(...args) {
    const logDrive = useSetRecoilState(eventLogDriverSelector)
    const [logKeys, setLogKeys] = useRecoilState(eventLogsState)
    let keys = logKeys//logs.map(({key}) => key)
    const [allLogDriverKeys, setAllLogDriverKeys]  = useRecoilState(logDriversState)
    
    let driveTheseKeys = args[0] === undefined? []
        : args.find(arg => typeof arg === 'array' && Boolean(arg.filter(a => typeof a === 'string' && a.length > 0).length > 0))
        .filter(key => typeof key === 'string' && key.length > 0)

    /**Control all collected events over all keys */
    let clear = () => {
        /**Delete all event logs for all keys */
    }

    /**Dam the river.
     * This is useful if the App wants to temporarily cut off adding more into memory or onto its network requests.
     * You can even deactivate log sending for log-keys that you haven't specified the driver to look after.
     */
    let jam = (deactivate = [], prevent = ['logging', 'sending']) => logDrive(
        'jam', 
        typeof deactivate === 'boolean'? !deactivate? [] : keys
            : typeof deactivate === 'array'? deactivate.map(sanitizeRawKey) 
            : [sanitizeRawKey(deactivate)],
        prevent
    )
    
    /**If the user "logs out" and all events should be deactivated and cleared*/
    let logout = () => {
        /**All events for all event log keys end */
        jam(true)
        clear()
    }
    
    /**Tell the driver the log uploading or logging can continue
     */
    let drive = () => {
        /**Un-pause all event log keys */
    }

    
    return {
        // logs,
        keys,
        jam,
        drive,
        clear,
        logout
    }
}