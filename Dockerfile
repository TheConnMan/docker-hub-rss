FROM node:22-alpine

RUN apk add --no-cache git && mkdir /app && chown nobody:nogroup /app

WORKDIR /app

USER nobody

COPY --chown=nobody:nogroup yarn.lock /app
COPY --chown=nobody:nogroup package.json /app
RUN yarn install

COPY --chown=nobody:nogroup . /app

EXPOSE 3000

CMD yarn start
