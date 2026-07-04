FROM node:22-alpine AS deps

RUN apk add --no-cache git && mkdir /app && chown nobody:nogroup /app

WORKDIR /app

USER nobody

COPY --chown=nobody:nogroup yarn.lock /app
COPY --chown=nobody:nogroup package.json /app
RUN yarn install --production && yarn cache clean

FROM node:22-alpine AS source

RUN mkdir /app

WORKDIR /app

COPY --chown=nobody:nogroup . /app
RUN rm -rf /app/.git /app/node_modules /app/.yarn-cache /app/.cache/yarn

FROM node:22-alpine

RUN mkdir /app && chown nobody:nogroup /app

WORKDIR /app

COPY --from=source --chown=nobody:nogroup /app/ /app/
COPY --from=deps --chown=nobody:nogroup /app/node_modules /app/node_modules

USER nobody

EXPOSE 3000

CMD yarn start
