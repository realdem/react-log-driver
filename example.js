// example.js
// This is an example JavaScript file that demonstrates how to use react-log-driver
import React from 'react';
import { useLogDriver, useLogger, useLoggerSender } from './react-log-driver';

// Example components to demonstrate usage of react-log-driver
const ExampleComponents = () => {
    // Initialize the logDriver with keys to manage
    const logDriver = useLogDriver(['exampleEvent', 'anotherEvent']);
    
    // Initialize a logger sender for actual logging with sending capability
    const loggerSender = useLoggerSender('exampleEvent', async (logs) => {
        console.log('Sending logs to server:', logs);
        // await fetch('/api/logs', { method: 'POST', body: JSON.stringify(logs) });
    }, {
        pendingSendMax: 5,
        timeInterval: 15000
    });

    // Simple logger for basic logging
    const logger = useLogger('anotherEvent');

    // Example of logging an event
    const handleSomeClick = () => {
        loggerSender.log({ code: 'button_click', info: 'User clicked a button' });
        logger({ code: 'simple_log', info: 'Simple log entry' });
    };
    
    // Return a simple component that indicates logging is happening
    return (
        <div>
            <h1>React Log Driver Example</h1>
            <button onClick={handleSomeClick}>Click to Log Event</button>
            <p>Check the console to see the logs being sent.</p>
            <p>Driving keys: {logDriver.keys.join(', ')}</p>
        </div>
    );
};

export default ExampleComponents;