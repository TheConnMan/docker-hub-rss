FROM alpine:3.4

RUN apk add --no-cache nodejs

WORKDIR /usr/src/app

COPY package.json /usr/src/app
RUN npm install

COPY . /usr/src/app

EXPOSE 3000

CMD npm start
