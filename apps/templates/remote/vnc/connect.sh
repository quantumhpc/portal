VNCDnsAdress=`echo ${VNCFullAdress} | awk '{print $1}'`
# Set DISPLAY
DNSNAME=`echo $VNCDnsAdress | awk -F":" '{print $1}'`
VNCDISPLAY=`echo $VNCDnsAdress | awk -F":" '{print $2}'`

export DISPLAY=":${VNCDISPLAY}.0"

VNCPORT=$((5900 + VNCDISPLAY))
# PBS sets PBS_O_WORKDIR, Slurm SLURM_SUBMIT_DIR; otherwise the job runs in its work dir.
JOBDIR="${PBS_O_WORKDIR:-${SLURM_SUBMIT_DIR:-$PWD}}"

# Native client file
cat << EOF > "${JOBDIR}/${JOBNAME}.vnc"
[connection]
host=${CONNECT_HOSTNAME}
port=${VNCPORT}
user=${USER}
EOF

# Browser access: read by the portal (as this user) to set up the websockify route.
if [ -n "${VNC_WEB_PASS}" ]
then
    ( umask 077
      cat << EOF > "${JOBDIR}/${JOBNAME}.web"
host=`hostname -f`
port=${VNCPORT}
password=${VNC_WEB_PASS}
EOF
    )
fi


VNCPIDFile="${HOME}/.vnc/${VNCDnsAdress}.pid"
VNCPID=`cat "${VNCPIDFile}"`

if [ -z "$VNCPID" ]
then 
    # Server is not running
    exit 1
fi