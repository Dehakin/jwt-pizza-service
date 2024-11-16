/*

1. HTTP requests
- HTTP method, path, status code
- If the request has an authorization header
- Request body
- Response body
2. Database requests
- SQL queries
3. Factory service requests
4. Any unhandled exceptions
5. Sanitize all log entries so that they do not contain any confidential information


*/

const config = require('./config.js');

class Logger {
    /*constructor() {
        // an array for each kind of data. After sending, reset to empty structures.

        const timer = setInterval (() => {
            try {
                
            }
            catch (error) {
                console.log('Error sending logs', error);
            }
        }, 10000);
        timer.unref();

    }*/

    httpLogger = (req, res, next) => {
        let originalSend = res.send;
        let responseBody;
        const path = req.path;
        const method = req.method;
        const hasAuthorizationHeader = !!req.headers.authorization;
        const requestBody = req.body;
        
        // this is causing problems
        res.send = function (body) {
            responseBody = body;
            originalSend.call(this, body);
        };

        res.on('finish', () => {
            const statusCode = responseBody.statusCode;
            let logLine = {
                method: method,
                path: path,
                statusCode : statusCode,
                requiredAuthorization: hasAuthorizationHeader,
                requestBody: JSON.stringify(requestBody),
                responseBody: JSON.stringify(responseBody)
            };
            this.sendLogToGrafana(this.statusCodeToLevel(statusCode), logLine, 'http');
        });
        next();
    };
    /*

    {
    "streams": [
        {
        "stream": { 
            "component": "jwt-pizza-service", 
            "level": "info", "type": "http-req" 
        },
        "values": [
            [
                "1717627004763", 
                "{\"name\":\"pizza diner\", \"email\":\"d@jwt.com\", \"password\":\"****\"}", 
                { "userID": "32", "traceID": "0242ac120002" }
            ]
        ]
        }
    ]
    }
    */

    sanitizePasswords (logString) {
        logString = logString.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
        return logString;
    }

    statusCodeToLevel (code) {
        if (code >= 500) return 'warn';
        else if (code >= 400) return 'error';
        
        return 'info';
    }

    getCurrentTime() {
        return (Math.floor(Date.now() / 1000) * 1000000000).toString();
    }

    sendLogToGrafana(level, logLine, type) {
        const time = this.getCurrentTime();
        /*
        const labels = { component: config.source, level: level, type: type };
        const values = [this.nowString(), this.sanitize(logData)];
        const logEvent = { streams: [{ stream: labels, values: [values] }] };*/

        const labels = {component: config.logging.source, level : level, type: type};
        const values = [time, JSON.stringify(logLine)];
        let fullObj = {streams : [{ stream: labels, values: [values] }] };
        let toSend = this.sanitizePasswords(JSON.stringify(fullObj));

        fetch(`${config.logging.url}`, {
            method: 'post',
            body: toSend,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`
            }
        }).then((res) => {
            if (!res.ok) console.log('Failed to send log to Grafana!!');
            //else console.log('Sent log data to grafana of type:', type);
        });
    }

    // end of class
}

module.exports = new Logger();