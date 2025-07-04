/**
 * React Log Driver Example
 * =====================
 * Demonstrates key features and usage patterns of react-log-driver.
 */

import React from 'react';
import { useLogDriver, useLogger, useLoggerSender } from './react-log-driver';

/**
 * Example Component
 * ==============
 * Shows various logging patterns and configurations
 */
const ExampleComponents = () => {
    /**
     * Log Driver Setup
     * -------------
     * Manages multiple log types with batch operations
     */
    const logDriver = useLogDriver({
        keys: ['exampleEvent', 'anotherEvent']
    });
    
    /**
     * Logger Sender Setup
     * ----------------
     * Full-featured logger with automatic sending
     */
    const loggerSender = useLoggerSender('exampleEvent', 
        // Send Function
        async (logs) => {
            console.log('Sending logs to server:', logs);
            // Production: await fetch('/api/logs', { method: 'POST', body: JSON.stringify(logs) });
        }, 
        // Configuration
        {
            pendingSendMax: 5,    // Send after 5 logs
            timeInterval: 15000   // Or every 15 seconds
        }
    );

    /**
     * Simple Logger Setup
     * ----------------
     * Basic logging without automatic sending
     */
    const logger = useLogger('anotherEvent');

    /**
     * Event Handler Example
     * -----------------
     * Shows how to log events on user actions
     */
    const handleSomeClick = () => {
        // Log with automatic sending
        loggerSender.log({ 
            code: 'button_click', 
            info: 'User clicked a button',
            metadata: { userAction: 'click' }
        });

        // Simple log entry
        logger({ 
            code: 'simple_log', 
            info: 'Simple log entry'
        });
    };
    
    return (
        <div>
            <h1>React Log Driver Example</h1>
            <button onClick={handleSomeClick}>Click to Log Event</button>
            <p>Check the console to see the logs being sent.</p>
            <p>Driving keys: {logDriver.keys.join(', ')}</p>
            <div>
                <h2>Log Status</h2>
                <ul>
                    <li>Active: {logDriver.driving.join(', ')}</li>
                    <li>Paused: {logDriver.jammed.join(', ')}</li>
                </ul>
            </div>
        </div>
    );
};

export default ExampleComponents;