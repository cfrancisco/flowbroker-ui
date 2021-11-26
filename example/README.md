# Flowbroker-UI Example

Here is an example for checking Flowbroker-UI integrated into a minimum Dojot workspace. To find out what service is used, you can examine docker-compose.yml. Two new containers are used to run a script aimed at setting up Dojot (creating devices, templates, and flows) and sending mock messages as a device.

## Simulating using Flowbroker-UI

Below is a description of how the example is programmed:

1. The device, template and flow are already created via script;
1. The 'data-loader service' publish a message as device each 30 seconds;
1. The sample flow are triggered by Event Template Node.
1. The sample flow publishes one notification for each received message, informing the device who initially triggered the flow.

To run this example, type:

```sh
docker-compose up
```

The notifications could be checked in GUI:

- http://localhost:8000/#/notifications

And the flows in Flowbroker-UI:

- http://localhost:8000/nodered/
