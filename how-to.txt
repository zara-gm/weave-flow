- use node 14, if 17: 
  export NODE_OPTIONS=--openssl-legacy-provider

A. UI

1. PROD DOCKER

- build
  docker build -t ethsf:latest -f Dockerfile.prodssl .

- test
  docker run -d -p 11180:80 ethsf:latest

- push image
  docker tag ethsf gcr.io/weavechain/ethsf:1.0
  docker push gcr.io/weavechain/ethsf:1.0
  docker tag ethsf gcr.io/weavechain/ethsf:latest
  docker push gcr.io/weavechain/ethsf:latest


2.1. INSTALL LOCAL
  cd ethsf22
  npm install
  react-scripts start

2.2. INSTALL PROD

- login to target machine
  gcloud compute --project weavechain ssh --zone "us-central1-a" demo-ethsf

- install docker
  https://tomroth.com.au/gcp-docker/

	sudo apt update
	sudo apt install --yes apt-transport-https ca-certificates curl gnupg2 software-properties-common
	curl -fsSL https://download.docker.com/linux/debian/gpg | sudo apt-key add -
	sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable"
	sudo apt update
	sudo apt install --yes docker-ce

	sudo usermod -aG docker $USER
	logout

- one time: 
  mkdir -p ~/certs
  mkdir -p ~/logs/nginx
  cd ~/logs/nginx
  sudo docker volume create nginx_logs
- copy certificates to server
  gcloud compute --project weavechain scp --recurse --zone "us-central1-a" fullchain.pem Admin@demo-ethsf:/home/Admin/certs/
  gcloud compute --project weavechain scp --recurse --zone "us-central1-a" privkey.pem Admin@demo-ethsf:/home/Admin/certs/
- then, on the demo-ethsf server:
  chmod 700 /home/Admin/certs/privkey.pem


3. START OR UPGRADE

- login to target machine
  gcloud compute --project weavechain ssh --zone "us-central1-a" demo-ethsf

- start server
  sudo su - Admin

  sudo docker stop ethsf
  sudo docker rm ethsf
  sudo docker pull gcr.io/weavechain/ethsf:latest
  sudo docker run -d --mount type=bind,src=/home/Admin/certs,dst=/etc/ssl/certs --mount type=bind,src=/home/Admin/logs/nginx,dst=/var/log/nginx --name ethsf -p 0.0.0.0:443:443 -p 0.0.0.0:80:80 gcr.io/weavechain/ethsf:latest


B. NODE

- login
  gcloud compute --project weavechain ssh --zone "us-central1-a" demo-ethsf22

- restart server
  sudo su - Admin

  sudo docker stop weave_node
  sudo docker rm weave_node
  sudo docker pull gcr.io/weavechain/weave_node:latest
  sudo docker run -d --mount type=bind,src=/home/$USER/config,dst=/app/config --mount type=bind,src=/home/$USER/storage,dst=/storage --name weave_node -p 0.0.0.0:443:443 -p 0.0.0.0:8000:8000 -ti gcr.io/weavechain/weave_node:latest /bin/bash bin/node /app/config/ethsf22.config


MongoDB tunnel for local access of the node:
  gcloud compute --project weavechain  ssh --zone "us-central1-a" prod-testnet-1 -- -N -L 37017:localhost:27017
