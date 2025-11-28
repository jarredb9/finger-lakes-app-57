#!/bin/sh
files=""
for file in "$@"; do
  files="$files --file $file"
done

# Run next lint with the constructed file arguments
# We use 'exec' so the exit code is preserved
exec npx next lint --fix $files
