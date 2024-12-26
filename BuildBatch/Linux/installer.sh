if ! command -v rsync >/dev/null 2>&1; 
then
    apt-get update
    apt-get install rsync
fi

source ./config.txt

CURRENT_PATH=${PWD}
SERVICE_PATH=/etc/systemd/system

CONFIG_DEPLOY_PATH=$CURRENT_PATH/config.txt

# Log server
# (component_svc, folder_name, exec_start)
create_service() {
    touch "$SERVICE_PATH/$1.service"

    if [[ $1 == "call_flow_bot_svc" ]]; then
        echo "[Unit]
Description=$1 Service
After=network.target

[Service]
WorkingDirectory=$DESTINATION/$2
ExecStart=$3
Restart=always
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target" > $SERVICE_PATH/$1.service
    else
        echo "[Unit]
Description=$1 Service
After=network.target

[Service]
WorkingDirectory=$DESTINATION/$2
ExecStart=$3
Restart=always
StandardOutput=append:/var/log/$1.log
StandardError=append:/var/log/$1-error.log

[Install]
WantedBy=multi-user.target" > $SERVICE_PATH/$1.service
    fi
}

LIST_EXIST_FILE=("CONFIG_DEPLOY_PATH")

for FILE in "${LIST_EXIST_FILE[@]}"
do
    if [ -z "${!FILE}" ]
    then
        echo $FILE is empty or null.
        exit 1
    fi
    if [ ! -f "${!FILE}" ]
    then
		echo Not found file ${!FILE}. Please add the file $FILE
        exit 1
    fi
done

if [ ! -d $BACKUP_DESTINATION ]
then
    mkdir -p $BACKUP_DESTINATION
fi 

if (($INSTALL_PROXY_ADMIN == 1))
then
    cd $CURRENT_PATH
    folder_name=$(basename $PROXY_ADMIN_DIR)

    if [ -z "$PROXY_ADMIN_DIR" ]
    then
        echo PROXY_ADMIN_DIR is empty or null.
        exit 1
    fi
    if [ ! -d "$PROXY_ADMIN_DIR" ]
    then
        echo Not found folder $PROXY_ADMIN_DIR. Please enter the correct path for PROXY_ADMIN_DIR
        exit 1
    fi
    if [ -z "$PROXY_ADMIN_SVC_NAME" ]
    then
        echo PROXY_ADMIN_SVC_NAME is empty or null.
        exit 1
    fi

    echo "Backup $DESTINATION/$folder_name to $BACKUP_DESTINATION"
    echo "Backup $DESTINATION/$folder_name to $BACKUP_DESTINATION" >> $CURRENT_PATH/install.log
    rsync -av --exclude='node_modules' $DESTINATION/$folder_name $BACKUP_DESTINATION

    echo "Moved $PROXY_ADMIN_DIR to $DESTINATION"
    echo "Moved $PROXY_ADMIN_DIR to $DESTINATION" >> $CURRENT_PATH/install.log
    rsync -av --exclude='node_modules' $PROXY_ADMIN_DIR $DESTINATION

    echo "Create service $PROXY_ADMIN_SVC_NAME"
    echo "Create service $PROXY_ADMIN_SVC_NAME" >> $current_path/install.log
    create_service $PROXY_ADMIN_SVC_NAME $folder_name "$DESTINATION/$folder_name/BackEnd --urls=http://localhost:3003"
fi

# install node components
LIST_COMPONENT_DIR=("CONNECTOR_DIR" "BOT_DIR" "PROXY_DIR" "INTENTSVC_DIR")
LIST_COMPONENT_INSTALL=("INSTALL_CONNECTOR" "INSTALL_BOT" "INSTALL_PROXY" "INSTALL_INTENTSVC")
LIST_COMPONENT_SVC_NAME=("CONNECTOR_SVC_NAME" "BOT_SVC_NAME" "PROXY_SVC_NAME" "INTENTSVC_SVC_NAME" "PROXY_ADMIN_SVC_NAME")

for ((i=0; i<${#LIST_COMPONENT_INSTALL[@]}; i++))
do
    install_component=${LIST_COMPONENT_INSTALL[$i]}
    component_dir=${LIST_COMPONENT_DIR[$i]}
    component_svc=${LIST_COMPONENT_SVC_NAME[$i]}
    folder_name=$(basename ${!component_dir})

    if ((${!install_component} == 1))
    then
        cd $CURRENT_PATH
        if [ -z "${!component_dir}" ]
        then
            echo $component_dir is empty or null.
            exit 1
        fi
        if [ ! -d "${!component_dir}" ]
        then
            echo Not found folder ${!component_dir}. Please enter the correct path for $component_dir
            exit 1
        fi
        if [ -z "${!component_svc}" ]
        then
            echo $component_svc is empty or null.
            exit 1
        fi

        echo "Backup $DESTINATION/$folder_name to $BACKUP_DESTINATION"
        echo "Backup $DESTINATION/$folder_name to $BACKUP_DESTINATION" >> $CURRENT_PATH/install.log
        rsync -av --exclude='node_modules' $DESTINATION/$folder_name $BACKUP_DESTINATION
        
        echo "Moved ${!component_dir} to $DESTINATION"
        echo "Moved ${!component_dir} to $DESTINATION" >> $CURRENT_PATH/install.log
        rsync -av --exclude='node_modules' ${!component_dir} $DESTINATION
        
        if (($INSTALL_NODE_MODULES == 1))
        then 
            echo "Installing node modules for $DESTINATION/$folder_name"
            echo "Installing node modules for $DESTINATION/$folder_name" >> $CURRENT_PATH/install.log
            cd "$DESTINATION/$folder_name"
            npm install
            echo "Node modules for $DESTINATION/$folder_name installed"
            echo "Node modules for $DESTINATION/$folder_name installed" >> $CURRENT_PATH/install.log
        fi

        echo "Create service ${!component_svc}"
        echo "Create service ${!component_svc}" >> $CURRENT_PATH/install.log
        create_service ${!component_svc} $folder_name "npm start"
    fi
done

#copy config file
# cd $CURRENT_PATH

# echo "Moved config file"
# echo "Moved config file" >> $CURRENT_PATH/install.log
# rsync -av --exclude='node_modules' $APACHE_CONFIG /etc/apache2/sites-available/

# if [ ! -L "/etc/apache2/sites-enabled/apache_primas_calbotconfig.conf" ]
# then
#     echo "Linked config file" >> $CURRENT_PATH/install.log
#     ln -s /etc/apache2/sites-available/$(basename $APACHE_CONFIG) /etc/apache2/sites-enabled/
# fi

systemctl daemon-reload
for ((i=0; i<${#LIST_COMPONENT_SVC_NAME[@]}; i++))
do
	install_component=${LIST_COMPONENT_INSTALL[$i]}
	if ((${!install_component} == 1))
    then
		component_svc=${LIST_COMPONENT_SVC_NAME[$i]}
		echo Restart service ${!component_svc}
		echo Restart service ${!component_svc} >> $CURRENT_PATH/install.log
		systemctl enable ${!component_svc}.service
		systemctl restart ${!component_svc}.service
	fi
    
done

echo Restart service apache2
echo Restart service apache2 >> $CURRENT_PATH/install.log
if ! a2query -m proxy >/dev/null 2>&1
then
    a2enmod proxy
fi
if ! a2query -m proxy_http >/dev/null 2>&1
then
    a2enmod proxy_http
fi
if ! a2query -m ssl >/dev/null 2>&1
then
    a2enmod ssl
fi
if ! a2query -m headers >/dev/null 2>&1
then
    a2enmod headers
fi
if ! a2query -m headers >/dev/null 2>&1
then
    a2enmod headers
fi
if ! a2query -s default-ssl >/dev/null 2>&1
then
    a2ensite default-ssl
fi
if ! a2query -m proxy_wstunnel >/dev/null 2>&1
then
    a2enmod proxy_wstunnel
fi
if ! a2query -m rewrite >/dev/null 2>&1
then
    a2enmod rewrite
fi

systemctl restart apache2
echo "Restarted apache. Done!"
echo "Restarted apache. Done!" >> $CURRENT_PATH/install.log

echo "Deploy successfully!"
echo "Deploy successfully!" >> $CURRENT_PATH/install.log