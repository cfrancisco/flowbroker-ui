#!/bin/bash

echo "Simulate kafka dojot msgs"
sleep 60

export DEVICE_HOST=http://device-manager:5000
export AUTH_HOST=http://auth:5000

# 1. GET Token - admin
export JWT=$(curl -X POST ${AUTH_HOST} -H 'Content-Type:application/json' -d '{"username": "admin", "passwd" : "admin"}' 2>/dev/null | jq '.jwt' -r)
echo "JWT: "$JWT

# 2. Get device
echo "Get device"
export DEVICE_ID=$(curl -X GET "${DEVICE_HOST}/device?template=1" -H "Authorization: Bearer ${JWT}" -H 'Content-Type:application/json' 2>/dev/null | jq -r '.devices[0].id')

# 3. Publish messages
echo "Publish messages"

while [ true ]; do
  echo "Publish for ${DEVICE_ID} in admin.device-data without timestamp"

  let val=145
  echo "{ \"metadata\": { \"deviceid\": \"${DEVICE_ID}\", \"tenant\":\"admin\"}, \"attrs\":  { \"sample_value\": ${val} }}"  |\
  kafkacat -b kafka:9092 -P -t admin.device-data
  sleep 20
done
