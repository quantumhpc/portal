CONNECT_HOSTNAME=`hostname -f`

if [ "${REMOTE_DOMAIN}" ];then
    CONNECT_HOSTNAME=`echo ${CONNECT_HOSTNAME} | sed "${REMOTE_DOMAIN}"`
fi