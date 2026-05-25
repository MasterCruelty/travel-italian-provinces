FROM nginx:alpine

COPY index.html style.css game.js /usr/share/nginx/html/
COPY data/ /usr/share/nginx/html/data/

EXPOSE 80
