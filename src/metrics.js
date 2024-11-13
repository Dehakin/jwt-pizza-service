// use this file for "all the code necessary to interact with Grafana"
/*
1. http requests by method/minute (total requests, get, put, post, delete requests) [done?]
2. Active users
3. Authentication attempts/minute (succeeded vs failed) [done?]
4. CPU and memory usage percentage [done?]
5. Pizzas (sold per minute, creation failures, revenue per minute)
6. Latency (by endpoint, and for pizza creation)

*/
const os = require('os');
const config = require('./config.js');

class MetricsTracker {
    constructor() {
        this.httpData = {
            total : 0,
            get : 0,
            put : 0,
            post : 0,
            delete : 0,
            unknown : 0
        }

        // add more objects to hold data here when necessary
        this.authData = {
            authSuccesses : 0,
            authFailures : 0
        }

        this.pizzaData = {
            creationSuccesses : 0,
            creationFailures : 0,
            revenue : 0.0
        }

        const timer = setInterval(() => {
            try {
                // send http data
                this.sendMetricToGrafana('totalRequests', 'all', 'total', this.httpData.total);
                this.sendMetricToGrafana('getRequests', 'get', 'amount', this.httpData.get);
                this.sendMetricToGrafana('putRequests', 'put', 'amount', this.httpData.put);
                this.sendMetricToGrafana('postRequests', 'post', 'amount', this.httpData.post);
                this.sendMetricToGrafana('deleteRequests', 'delete', 'amount', this.httpData.delete);
                
                // send system data
                this.sendGenericMetricToGrafana('cpuUsage', 'cpu', this.getCpuUsagePercentage());
                this.sendGenericMetricToGrafana('memoryUsage', 'memory', this.getMemoryUsagePercentage());

                // authentication data
                this.sendGenericMetricToGrafana('authSuccesses', 'successes', this.authData.authSuccesses);
                this.sendGenericMetricToGrafana('authFailures', 'failures', this.authData.authFailures);

                // pizza data
                this.sendGenericMetricToGrafana('pizzasMade', 'pizzaSuccesses', this.pizzaData.creationSuccesses);
                this.sendGenericMetricToGrafana('pizzasFailed', 'pizzaFailures', this.pizzaData.creationFailures);
                this.sendGenericMetricToGrafana('pizzaRevenue', 'revenue', this.pizzaData.revenue);

            }
            catch (error) {
                console.log('Error sending metrics', error);
            }
        }, 10000);
        timer.unref();
    }
    httpTracker = (req, res, next) => {
        const method = req.method;
        if (method == "GET"){
            this.httpData.get += 1;
        }
        else if (method == "PUT") {
            this.httpData.put += 1;
        }
        else if (method == "POST") {
            this.httpData.post += 1;
        }
        else if (method == "DELETE") {
            this.httpData.delete += 1;
        }
        else {
            this.httpData.unknown += 1;
        }
        this.httpData.total += 1;
        next();
    };

    authenticationTracker = (req, res, next) => {
        if (req.method === 'PUT' && req.path.endsWith('/api/auth')) {
            let send = res.send;
            res.send = (resBody) => {
                const statusCode = res.statusCode;
                if (statusCode >= 400) {
                    this.authData.authFailures += 1;
                }
                else {
                    this.authData.authSuccesses += 1;
                }
                res.send = send;
                return res.send(resBody);
            };
        }
        next();
    };

    pizzaTracker = (req, res, next) => {
        // revenue, pizza 
        if (req.method === 'POST' && req.path.endsWith('/api/order')) {
            // this is a pizza creation req
            let send = res.send;
            res.send = (resBody) => {
                // go through each item, get total # of pizzas and total price
                let numPizzas = 0;
                let cost = 0;
                const items = res.body.order.items;
                for (let item of items) {   
                    cost += item.price;
                    numPizzas += 1;
                }

                if (res.statusCode >= 400) {
                    this.pizzaData.creationFailures += numPizzas;
                }
                else {
                    this.pizzaData.creationSuccesses += numPizzas;
                    this.pizzaData.revenue += cost;
                }

                res.send = send;
                return res.send(resBody);
            };
        }
        next();
    };


    sendGenericMetricToGrafana(metricPrefix, metricName, metricValue) {
        const metric = `${metricPrefix},source=${config.metrics.source} ${metricName}=${metricValue}`;
    
        fetch(`${config.metrics.url}`, {
            method: 'post',
            body: metric,
            headers: { Authorization: `Bearer ${config.metrics.userId}:${config.metrics.apiKey}` },
          })
            .then((response) => {
              if (!response.ok) {
                console.error('Failed to push metrics data to Grafana');
              } else {
                console.log(`Pushed ${metric}`);
              }
            })
            .catch((error) => {
              console.error('Error pushing metrics:', error);
            });
    }

    sendMetricToGrafana(metricPrefix, httpMethod, metricName, metricValue) {
        const metric = `${metricPrefix},source=${config.metrics.source},method=${httpMethod} ${metricName}=${metricValue}`;
    
        fetch(`${config.metrics.url}`, {
          method: 'post',
          body: metric,
          headers: { Authorization: `Bearer ${config.metrics.userId}:${config.metrics.apiKey}` },
        })
          .then((response) => {
            if (!response.ok) {
              console.error('Failed to push metrics data to Grafana');
            } else {
              console.log(`Pushed ${metric}`);
            }
          })
          .catch((error) => {
            console.error('Error pushing metrics:', error);
          });
    }
    
    getCpuUsagePercentage() {
        const usage = os.loadavg()[0] / os.cpus().length;
        return usage.toFixed(2) * 100;
    }
    getMemoryUsagePercentage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsage = (usedMemory / totalMemory) * 100;
        return memoryUsage.toFixed(2);
    }
    
}


module.exports = new MetricsTracker();