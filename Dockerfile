FROM node:8.1-alpine

WORKDIR /app

COPY package.json /app
RUN npm install

COPY . /app

EXPOSE 80
CMD npm start
