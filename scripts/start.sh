#!/bin/sh

. ~/bin/setup_node_env.sh

export NODE_ENV="production"

# extract options and their arguments into variables.
while getopts i: FLAG; do
	case $FLAG in
		i)
			NODE_APP_INSTANCE=$OPTARG
			export NODE_APP_INSTANCE
			;;
		\?) echo "Internal error! Unrecognized argument $FLAG" ; exit 1 ;;
	esac
done


node index.js
