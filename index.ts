#!/usr/bin/env node
import * as yargs from 'yargs'
import {argv} from "yargs";
import * as http from "http";
import {v4} from "uuid";
import {constant, constantError, fromEvents, later, merge, never, pool} from "@hitorisensei/kefir-atomic";
import {ServerResponse} from "http";

const getPort = require('fix-esm').require("get-port").default;

const args = yargs
    .scriptName("http-transfer-server")
    .usage('$0 <cmd> [args]')
    .option('port', {
        type: "number",
        description: "Port at which to start HTTP server",
        default: 18080
    })
    .option('timeout', {
        type: "number",
        description: "Time allowed to wait for the GET command to fetch the file. (0 means indefinitely)",
        default: 0
    })
    .help()
    .usage(`After you start the server on [port], you can initiate transfer by using POST, eg using cURL:
    
    curl -N --data-binary "@/file/to/transfer" "server[:port]"
     
eg.

     curl -N --data-binary "@/var/logs/log.log" "https://transfer.example.com"
     
You will be prompted with GET address to fetch the file on the remote machine:

    Awaiting GET /1d12c367-8e83-4cce-abb9-0eaee0a69f90
    ...

then you can then get the file using:

     curl "https://transfer.example.com/1d12c367-8e83-4cce-abb9-0eaee0a69f90" > log.log
     
You can also supply your own id in POST path:

     curl -N --data-binary "@/var/logs/log.log" "https://transfer.example.com/my-id"
     
then you can get the file using:

     curl "https://transfer.example.com/my-id" > log.log
    `)
    .parseSync()


const pendingRequestsPool = pool<{id: string, res: ServerResponse}, unknown>()
const pendingTransfers = {}

class TimeoutError  {
    toString() { return "Timeout" }
}


class SourceError {
    toString() { return "Source closed" }
}

async function main() {
    let port = args.port || await getPort();
    console.log(`Starting on ${port}`)

    let server = http.createServer(async function (req, res) {
        if(req.method === 'POST') {
            const id = req.url.replace(/^\//, '') || v4()
            if(pendingTransfers[id]) {

                res.writeHead(409);
                res.write(`There is already a pending transfer on /${id}\n`)
                res.end()
                return
            }

            let keepAlive: NodeJS.Timer;
            try {
                req.pause()

                console.log(`Starting transfer /${id}`)
                res.writeHead(201, {
                    'Transfer-Encoding': 'chunked',
                    'Content-Type':'text/plain'
                });
                pendingTransfers[id] = true
                res.flushHeaders()

                res.write(`Awaiting GET /${id}\n`)

                console.log("req.complete", req.complete);

                const aborted = fromEvents(req, 'close')
                    .flatMap(() => constantError(new SourceError()))

                const timeout = args.timeout
                    ? later(args.timeout,0)
                        .flatMap(() => constantError(new TimeoutError()))
                    : never()

                keepAlive = setInterval(() => {
                    res.write('.')
                }, 1000);

                const {res: target} = await merge([
                    pendingRequestsPool.filter(p => p.id === id),
                    aborted,
                    timeout
                ]).take(1).takeErrors(1).toPromise()

                req.resume()
                let sendingToMsg = `Sending to ${target.socket.remoteAddress}`;
                console.log(sendingToMsg)
                res.write(`\n${sendingToMsg}`)
                req.pipe(target);
                await new Promise((resolve, reject) => {
                    req.on('end', () => {
                        let sentToMsg = `Sent to ${target.socket.remoteAddress}`;
                        console.log(sentToMsg)
                        res.write(`\n${sentToMsg}`)
                        target.end();
                        res.end();
                        resolve(true)
                    });
                    req.on('error', reject)
                    target.on('error', reject)
                })
            } catch (e) {
                if(e instanceof TimeoutError && !req.complete) {
                    res.write('Transfer timed out')
                    res.end()
                }
                console.error("Error", e)
            } finally {
                if(keepAlive) {
                    clearInterval(keepAlive)
                }
                console.log(`Clearing transfer /${id}`)
                delete pendingTransfers[id]
            }

        } else if(req.method === 'GET') {
            const id = req.url.replace(/^\//, '') || v4()
            if(!pendingTransfers[id]) {
                res.writeHead(404);
                res.write(`Transfer not found for /${id}`)
                res.end()
            }

            res.writeHead(200, { "Content-type": "application/octet-stream" });
            pendingRequestsPool.plug(constant({
                res: res,
                id: id
            }))
        }

    });
    await new Promise((resolve,reject) => {
        server.listen(port)
            .on('listening', resolve)
            .on('error', reject)
    })
    console.log(`Listening on ${port}`)
}

main()
.catch(e => {
    console.error(e)
    process.exit(1)
})