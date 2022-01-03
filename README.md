# Description
Application that allows transferring files via HTTP protocol without size limit or storing any of the transferred data (excluding socket buffers).

# Usage
After you start the server on [port], you can initiate transfer by using
POST, eg using cURL:

```shell
curl -N --data-binary "@/file/to/transfer" "server[:port]"
```

eg.
```shell
curl -N --data-binary "@/var/logs/log.log" "https://transfer.example.com"
```
You will be prompted with GET address to fetch the file on the remote
machine:

```shell
Awaiting GET /1d12c367-8e83-4cce-abb9-0eaee0a69f90
...
```

then you can then get the file using:
```shell
curl "https://transfer.example.com/1d12c367-8e83-4cce-abb9-0eaee0a69f90" >
log.log
```

You can also supply your own id in POST path:
```shell
curl -N --data-binary "@/var/logs/log.log"
"https://transfer.example.com/my-id"
```
then you can get the file using:
```shell
curl "https://transfer.example.com/my-id" > log.log
```
# CLI
```shell
Options:
--version  Show version number                                   [boolean]
--port     Port at which to start HTTP server    [number] [default: 18080]
--timeout  Time allowed to wait for the GET command to fetch the file. (0
means indefinitely)                       [number] [default: 0]
--help     Show help                                             [boolean]
```