# react-log-driver
**For ReactJS: Collect data objects as custom event logs & send them your server.**

*Project board: https://github.com/users/realdem/projects/1*

### Task list:
- [ ] Finish everything commented with "DEV_REMINDER"
- [ ] Test everything out

## About
- Wrap your application in <LogRiver>

## Glossary / Get Started
1. Events
    - An event is a logged datum which denotes when a user has performed an actino of any kind.
    - 
2. <LogRiver>
    - Wrap your app with this component
    - (optional) Provide it with your own "@tanstack/react-query" 
3. useLogDriver()
    - 
4. useLogger()
    - On any component that you want to log events from, create a logger function that accepts an event code and an object of information about it.
5. useLoggerSender()
    - This hook...
6. Log keys
    - Each log is carpenmentalized with a key
    - Logs can be sent separately