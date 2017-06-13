FROM node:8.1-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json /app
RUN npm install

COPY . /app

EXPOSE 3000

CMD npm start
