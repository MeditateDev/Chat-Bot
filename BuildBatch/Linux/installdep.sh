#!/bin/bash

sudo apt-get install -y wget
sudo apt install -y curl
sudo apt install -y software-properties-common

#install rsync
if ! command -v rsync >/dev/null 2>&1; 
then
    sudo apt-get update
    sudo apt-get install rsync
fi

#install apache2
if command -v apache2 &>/dev/null; then
    echo "Apache HTTP Server (apache2) is installed."
else
    echo "Apache HTTP Server (apache2) is not installed."
    apt-get install -y apache2
fi

#install nvm node
if command -v node &>/dev/null; then
    echo "Node.js is installed. Version: $(node -v)"
else
    echo "Node.js is not installed."
    curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
    sudo apt install -y nodejs
fi

#install mssql
if dpkg -s mssql-server >/dev/null &>/dev/null; then
    echo "Microsoft SQL Server (mssql-server) is installed and running."
else
    echo "Microsoft SQL Server (mssql-server) is not installed or not running."
    wget -qO- https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
    sudo add-apt-repository "$(wget -qO- https://packages.microsoft.com/config/ubuntu/20.04/mssql-server-2022.list)"
    sudo apt-get update
    sudo apt-get install -y mssql-server
    sudo /opt/mssql/bin/mssql-conf setup
fi