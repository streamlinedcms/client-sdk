#!/bin/bash
set -e

# Sync environment variables from .env files to GitHub environments.
# Reads from .env (production) or .env.staging (staging) and pushes to GitHub.
# Requires: gh CLI authenticated with admin permissions

show_help() {
    cat <<EOF
Usage: ./scripts/sync-env-vars.sh <environment> <action>

Sync environment variables from .env files to GitHub environments.

Environments:
  staging     Reads from .env.staging (with fallback to .env for resource IDs)
  production  Reads from .env

Actions:
  view        Show what would be synced (reads local .env, shows GitHub values)
  apply       Sync variables to GitHub environment

Variables synced:
  SDK_API_URL           - API endpoint for SDK builds
  SDK_APP_URL           - App URL for SDK builds
  R2_BUCKET_*           - R2 bucket name for CDN uploads
  KV_NAMESPACE_*        - KV namespace ID for CDN publishing

Examples:
  ./scripts/sync-env-vars.sh staging view      # preview staging sync
  ./scripts/sync-env-vars.sh production view   # preview production sync
  ./scripts/sync-env-vars.sh staging apply     # sync to staging
  ./scripts/sync-env-vars.sh production apply  # sync to production

Note: CLOUDFLARE_API_TOKEN is NOT synced - set it manually as a repository secret.
EOF
    exit 0
}

# Show help if no arguments
if [ $# -eq 0 ]; then
    show_help
fi

# Parse arguments
COMMAND=""
ENVIRONMENT=""

for arg in "$@"; do
    case $arg in
        --help)
            show_help
            ;;
        view|apply)
            COMMAND="$arg"
            ;;
        staging|production)
            ENVIRONMENT="$arg"
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ -z "$COMMAND" ]; then
    echo "Error: command required (view or apply)"
    exit 1
fi

if [ -z "$ENVIRONMENT" ]; then
    echo "Error: environment required (staging or production)"
    exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables from file
load_env_file() {
    local file=$1
    if [ -f "$file" ]; then
        # Export variables, ignoring comments and empty lines
        set -a
        source "$file"
        set +a
    fi
}

# Get variable value (from loaded env or existing shell)
get_var() {
    local name=$1
    echo "${!name}"
}

# Get current GitHub environment variable value
get_github_var() {
    local var_name=$1
    gh variable get "$var_name" --env "$ENVIRONMENT" 2>/dev/null || echo "(not set)"
}

# Set GitHub environment variable
set_github_var() {
    local var_name=$1
    local var_value=$2
    gh variable set "$var_name" --env "$ENVIRONMENT" --body "$var_value"
}

echo "Repository: $REPO"
echo "Environment: $ENVIRONMENT"
echo

# Load appropriate env files
if [ "$ENVIRONMENT" = "staging" ]; then
    # Load .env for resource IDs
    load_env_file "$PROJECT_DIR/.env"

    # Load .env.staging for staging-specific values
    load_env_file "$PROJECT_DIR/.env.staging"

    # Map VITE_ prefixed vars to SDK_ (overwriting production values)
    if [ -n "$VITE_API_URL" ]; then
        SDK_API_URL="$VITE_API_URL"
    fi
    if [ -n "$VITE_APP_URL" ]; then
        SDK_APP_URL="$VITE_APP_URL"
    fi

    VARS_TO_SYNC=(
        "CLOUDFLARE_ACCOUNT_ID"
        "SDK_API_URL"
        "SDK_APP_URL"
        "R2_BUCKET_STAGING"
        "KV_NAMESPACE_STAGING"
    )
else
    # Production: load .env
    load_env_file "$PROJECT_DIR/.env"

    VARS_TO_SYNC=(
        "CLOUDFLARE_ACCOUNT_ID"
        "SDK_API_URL"
        "SDK_APP_URL"
        "R2_BUCKET_PRODUCTION"
        "KV_NAMESPACE_PRODUCTION"
    )
fi

# Execute command
if [ "$COMMAND" = "view" ]; then
    echo "Variables to sync:"
    echo
    printf "%-25s %-6s %-40s %s\n" "Variable" "Match" "Local Value" "GitHub Value"
    printf "%-25s %-6s %-40s %s\n" "--------" "-----" "-----------" "------------"

    for var_name in "${VARS_TO_SYNC[@]}"; do
        local_value=$(get_var "$var_name")
        github_value=$(get_github_var "$var_name")

        # Compare full values before truncating
        if [ "$local_value" = "$github_value" ]; then
            match="yes"
        else
            match="no"
        fi

        # Truncate long values for display
        local_display="$local_value"
        github_display="$github_value"
        if [ ${#local_display} -gt 37 ]; then
            local_display="${local_display:0:34}..."
        fi
        if [ ${#github_display} -gt 17 ]; then
            github_display="${github_display:0:14}..."
        fi

        printf "%-25s %-6s %-40s %s\n" "$var_name" "$match" "${local_display:-(not set)}" "$github_display"
    done

elif [ "$COMMAND" = "apply" ]; then
    echo "Syncing variables..."
    echo

    for var_name in "${VARS_TO_SYNC[@]}"; do
        local_value=$(get_var "$var_name")

        if [ -z "$local_value" ]; then
            echo "  $var_name: SKIPPED (not set locally)"
            continue
        fi

        set_github_var "$var_name" "$local_value"
        echo "  $var_name: synced"
    done

    echo
    echo "Done. Variables synced to '$ENVIRONMENT' environment."
fi
