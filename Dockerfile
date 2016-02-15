# Docker image for the Drone ECS node plugin
#

FROM mhart/alpine-node

RUN npm install -g bunyan
RUN mkdir /drone-ecs-node
ADD package.json /drone-ecs-node/package.json
WORKDIR /drone-ecs-node
RUN npm install
ADD app.js /drone-ecs-node/app.js
ADD run.sh /drone-ecs-node/run.sh
RUN chmod +x /drone-ecs-node/run.sh
ENTRYPOINT ["/drone-ecs-node/run.sh"]
