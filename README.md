# react-log-driver

**For ReactJS: Collect data objects as custom event logs & send them to your server.**

This project provides a way to collect and send custom event logs from a React application to a server. It includes components and hooks that make it easy to log events and manage the sending of logs.

## Task list:
- Finish everything commented with "DEV_REMINDER"
- Test everything out
- Project board [seen here](https://github.com/users/realdem/projects/1)

## About
The main component in this project is `<LogRiver>`. By wrapping your application with this component, you can enable event logging. Additionally, you can provide your own `@tanstack/react-query` instance to `<LogRiver>` for more advanced functionality.

## Glossary / Get Started
1. Events:
    - An event is a logged datum that represents when a user has performed an action of any kind.

2. `<LogRiver>`:
    - Wrap your app with this component to enable event logging.
    - (optional) Provide it with your own `@tanstack/react-query` instance for advanced functionality.

3. `useLogDriver()`:
    - A hook that provides access to the log driver instance.

4. `useLogger()`:
    - A hook that can be used on any component to create a logger function. This function accepts an event code and an object containing information about the event.

5. `useLoggerSender()`:
    - A hook that provides a way to send logs to the server.

6. Log keys:
    - Each log is associated with a key, allowing logs to be sent separately if needed.