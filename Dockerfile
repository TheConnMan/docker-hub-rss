FROM node:12-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY yarn.lock /app
COPY package.json /app
RUN yarn install

COPY . /app

EXPOSE 3000

CMD yarn start
