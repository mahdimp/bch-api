# syntax=docker/dockerfile:1

FROM node:16.13
ENV NODE_ENV=production

WORKDIR ./

COPY ["package.json", "package-lock.json*", "./"]

RUN yarn install

COPY . .

EXPOSE 1361
CMD [ "yarn", "start" ]