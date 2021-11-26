#!/bin/bash

echo "Running Data Loader"
sleep 30

#### Host information

export DEVICE_HOST=http://device-manager:5000
export AUTH_HOST=http://auth:5000
export FLOW_HOST=http://flowbroker:80

# 1. GET Token - admin
export JWT=$(curl -X POST ${AUTH_HOST} -H 'Content-Type:application/json' -d '{"username": "admin", "passwd" : "admin"}' 2>/dev/null | jq '.jwt' -r)
echo "JWT: "$JWT" <---"


# 2. Create template
echo "Create template"
export TEMPLATE_ID=$(curl -X POST ${DEVICE_HOST}/template -H "Authorization: Bearer ${JWT}" -H 'Content-type:application/json' -d '
{
	"label": "Sample Template",
	"attrs": [{
			"label": "sample_value",
			"static_value": "",
			"type": "dynamic",
			"value_type": "float"
		}
	]
}' 2>/dev/null | jq -r '.template.id')

echo "Template created with id: $TEMPLATE_ID"

# 3. Create device
echo "Create device"

	export DEVICE_ID_1=$(curl -X POST "${DEVICE_HOST}/device" -H "Authorization: Bearer ${JWT}" -H 'Content-Type:application/json' -d "{
	\"attrs\":[],
	\"templates\" : [${TEMPLATE_ID}],
	\"label\" : \"sample device\"
	}" 2>/dev/null | jq -r '.devices[0].id')

echo "Device created."


# 4. Create flow
echo "Create flow"

 curl -X POST "${FLOW_HOST}/v1/flow" -H "Authorization: Bearer ${JWT}" -H 'Content-Type:application/json' \
 --data-raw $'{"name":"flows1","flow":[{"id":"Ad3a209c5874318","type":"tab","label":"Flow 1"},{"id":"A169808f113c1f7","type":"event template in","z":"Ad3a209c5874318","name":"","event_create":false,"event_update":false,"event_remove":false,"event_configure":false,"event_publish":true,"template_id":"'${TEMPLATE_ID}'","x":125.5,"y":56,"wires":[["A8f08937247e0d"]]},{"id":"A8f08937247e0d","type":"template","z":"Ad3a209c5874318","name":"","field":"payload","fieldType":"msg","syntax":"handlebars","template":"This is the payload:  {{{stringify payload}}} \u0021","output":"str","x":335.5,"y":74,"wires":[["A92e1ee8884df1"]]},{"id":"A92e1ee8884df1","type":"notification","z":"Ad3a209c5874318","name":"","source":"","sourceFieldType":"msg","messageDynamic":"payload","messageStatic":"","messageFieldType":"msg","msgType":"dynamic","x":523.5,"y":90,"wires":[]}]}' \
  --compressed
