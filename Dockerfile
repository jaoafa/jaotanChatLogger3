FROM node:19 as builder

WORKDIR /app

COPY package.json .
COPY yarn.lock .
RUN yarn install && \
  yarn cache clean

COPY src/ src/
COPY tsconfig.json .

COPY entrypoint.sh .

ENTRYPOINT [ "/app/entrypoint.sh" ]