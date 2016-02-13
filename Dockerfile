# Docker image for the Drone ECS node plugin
#

FROM mhart/alpine-node

RUN npm install -g bunyan
RUN mkdir /drone-ecs-node
ADD package.json /drone-ecs-node/package.json
ADD app.js /drone-ecs-node/app.js
ADD run.sh /drone-ecs-node/run.sh
ADD humps /drone-ecs-node/humps
RUN chmod +x /drone-ecs-node/run.sh
WORKDIR /drone-ecs-node
RUN npm install
ENTRYPOINT ["/drone-ecs-node/run.sh"]
