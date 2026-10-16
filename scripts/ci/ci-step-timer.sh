#!/bin/bash

# CI Step Timer
# Usage: ./ci-step-timer.sh [run-id] [step-name]

RUN_ID=$1
STEP_NAME=${2:-"Set up job"}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed. Please install it to use this script."
    exit 1
fi

# If no Run ID is provided, find the latest completed run
if [ -z "$RUN_ID" ]; then
    echo "No Run ID provided. Fetching the latest completed run..."
    RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
    
    if [ -z "$RUN_ID" ]; then
        echo "Error: Could not find any workflow runs."
        exit 1
    fi
    echo "Using Run ID: $RUN_ID"
fi

if [ "$STEP_NAME" == "all" ]; then
    echo "----------------------------------------------------------------"
    echo "Full Timing Report (All Steps) across sharded jobs"
    echo "----------------------------------------------------------------"
    gh run view "$RUN_ID" --json jobs | jq -r "
      .jobs[] 
      | select(.name | contains(\"Sharded E2E Tests\")) 
      | \"\n=== \" + .name + \" ===\",
        (.steps[] | \"  [\" + .name + \"]: \" + (((.completedAt | fromdate) - (.startedAt | fromdate)) | tostring) + \"s\")
    "
else
    echo "----------------------------------------------------------------"
    echo "Timing step: '$STEP_NAME' across sharded jobs"
    echo "----------------------------------------------------------------"
    gh run view "$RUN_ID" --json jobs | jq -r "
      .jobs[] 
      | select(.name | contains(\"Sharded E2E Tests\")) 
      | .name as \$jobName 
      | .steps[] 
      | select(.name == \"$STEP_NAME\") 
      | \"[\" + \$jobName + \"]: \" + (((.completedAt | fromdate) - (.startedAt | fromdate)) | tostring) + \"s\"
    "
fi
