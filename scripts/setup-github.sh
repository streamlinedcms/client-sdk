#!/bin/bash
set -e

# Setup GitHub repository configuration: branch rulesets and environments.
# Requires: gh CLI authenticated with admin permissions

show_help() {
    cat <<EOF
Usage: ./scripts/setup-github.sh <resource> <action> [scope] [options]

Setup GitHub repository configuration: branch rulesets and environments.

Resources:
  rulesets      Branch protection rulesets (scope: master, develop)
  environments  GitHub environments for deployments (scope: staging, production)

Actions:
  view        Show current settings from GitHub
  apply       Apply settings to GitHub

Options:
  --help      Show this help message
  --dry-run   Preview changes without applying (only for 'apply')

Examples:
  ./scripts/setup-github.sh rulesets view              # view all rulesets
  ./scripts/setup-github.sh rulesets view master       # view master ruleset only
  ./scripts/setup-github.sh rulesets apply             # apply all rulesets
  ./scripts/setup-github.sh rulesets apply develop     # apply develop ruleset only
  ./scripts/setup-github.sh rulesets apply --dry-run   # preview ruleset changes
  ./scripts/setup-github.sh environments view          # view all environments
  ./scripts/setup-github.sh environments apply         # create all environments
  ./scripts/setup-github.sh environments apply staging # create staging only

Requirements:
  - gh CLI installed and authenticated
  - Admin permissions on the repository

Rulesets:
  master:
    - Require PR before merging (1 approval, dismiss stale reviews)
    - Require status checks to pass (must be up to date)
    - Block force pushes, restrict deletions
    - Admins can bypass

  develop:
    - Require PR before merging (no approval required)
    - Require status checks to pass (not required to be up to date)
    - Allow force pushes, restrict deletions
    - Admins can bypass

Environments:
  staging     - Auto-deploy target for develop branch
  production  - Auto-deploy target for master branch
EOF
    exit 0
}

# Show help if no arguments
if [ $# -eq 0 ]; then
    show_help
fi

# Parse arguments
COMMAND=""
DRY_RUN=false
RESOURCE=""
SCOPE=""

for arg in "$@"; do
    case $arg in
        --help)
            show_help
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        view|apply)
            COMMAND="$arg"
            ;;
        rulesets|environments)
            RESOURCE="$arg"
            ;;
        master|develop|staging|production)
            SCOPE="$arg"
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Resource is required
if [ -z "$RESOURCE" ]; then
    echo "Error: resource required (rulesets or environments)"
    echo "Use --help for usage information"
    exit 1
fi

# Command is required
if [ -z "$COMMAND" ]; then
    echo "Error: action required (view or apply)"
    echo "Use --help for usage information"
    exit 1
fi

# Validate scope matches resource
if [ -n "$SCOPE" ]; then
    if [ "$RESOURCE" = "rulesets" ] && [[ ! "$SCOPE" =~ ^(master|develop)$ ]]; then
        echo "Error: scope for rulesets must be 'master' or 'develop'"
        exit 1
    fi
    if [ "$RESOURCE" = "environments" ] && [[ ! "$SCOPE" =~ ^(staging|production)$ ]]; then
        echo "Error: scope for environments must be 'staging' or 'production'"
        exit 1
    fi
fi

# Validate --dry-run is only used with apply
if [ "$DRY_RUN" = "true" ] && [ "$COMMAND" != "apply" ]; then
    echo "Error: --dry-run can only be used with 'apply' command"
    exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# ============================================================================
# RULESETS
# ============================================================================

BRANCHES=(master develop)

get_ruleset_name() {
    echo "$1-protection"
}

get_ruleset_id() {
    local name=$1
    gh api "/repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id" 2>/dev/null || echo ""
}

view_ruleset() {
    local branch=$1
    local name=$(get_ruleset_name "$branch")
    local ruleset_id=$(get_ruleset_id "$name")

    echo
    echo "Ruleset '$name':"

    if [ -z "$ruleset_id" ]; then
        echo "  (not found)"
        return
    fi

    gh api "/repos/$REPO/rulesets/$ruleset_id" | jq '{
        id: .id,
        name: .name,
        enforcement: .enforcement,
        bypass_actors: .bypass_actors,
        conditions: .conditions,
        rules: .rules
    }' | sed 's/^/  /'
}

apply_ruleset() {
    local branch=$1
    local payload=$2
    local name=$(get_ruleset_name "$branch")
    local ruleset_id=$(get_ruleset_id "$name")

    payload=$(echo "$payload" | jq --arg name "$name" '.name = $name')

    echo
    echo "Ruleset '$name':"

    if [ "$DRY_RUN" = "true" ]; then
        if [ -n "$ruleset_id" ]; then
            echo "  Action: UPDATE (id: $ruleset_id)"
        else
            echo "  Action: CREATE"
        fi
        echo "  Payload:"
        echo "$payload" | jq '.' | sed 's/^/    /'
    else
        if [ -n "$ruleset_id" ]; then
            gh api \
                --method PUT \
                "/repos/$REPO/rulesets/$ruleset_id" \
                --input - <<< "$payload" > /dev/null
            echo "  Updated (id: $ruleset_id)"
        else
            local result=$(gh api \
                --method POST \
                "/repos/$REPO/rulesets" \
                --input - <<< "$payload")
            local new_id=$(echo "$result" | jq -r '.id')
            echo "  Created (id: $new_id)"
        fi
    fi
}

master_payload=$(cat <<'EOF'
{
    "target": "branch",
    "enforcement": "active",
    "bypass_actors": [
        {
            "actor_id": 5,
            "actor_type": "RepositoryRole",
            "bypass_mode": "always"
        }
    ],
    "conditions": {
        "ref_name": {
            "include": ["refs/heads/master"],
            "exclude": []
        }
    },
    "rules": [
        { "type": "deletion" },
        { "type": "non_fast_forward" },
        {
            "type": "pull_request",
            "parameters": {
                "required_approving_review_count": 1,
                "dismiss_stale_reviews_on_push": true,
                "required_reviewers": [],
                "require_code_owner_review": false,
                "require_last_push_approval": false,
                "required_review_thread_resolution": false,
                "allowed_merge_methods": ["merge"]
            }
        },
        {
            "type": "required_status_checks",
            "parameters": {
                "strict_required_status_checks_policy": true,
                "required_status_checks": [
                    { "context": "lint" },
                    { "context": "build" },
                    { "context": "test" },
                    { "context": "check-release-label / check" }
                ]
            }
        }
    ]
}
EOF
)

develop_payload=$(cat <<'EOF'
{
    "target": "branch",
    "enforcement": "active",
    "bypass_actors": [
        {
            "actor_id": 5,
            "actor_type": "RepositoryRole",
            "bypass_mode": "always"
        }
    ],
    "conditions": {
        "ref_name": {
            "include": ["refs/heads/develop"],
            "exclude": []
        }
    },
    "rules": [
        { "type": "deletion" },
        {
            "type": "pull_request",
            "parameters": {
                "required_approving_review_count": 0,
                "dismiss_stale_reviews_on_push": false,
                "required_reviewers": [],
                "require_code_owner_review": false,
                "require_last_push_approval": false,
                "required_review_thread_resolution": false,
                "allowed_merge_methods": ["merge"]
            }
        },
        {
            "type": "required_status_checks",
            "parameters": {
                "strict_required_status_checks_policy": false,
                "required_status_checks": [
                    { "context": "lint" },
                    { "context": "build" },
                    { "context": "test" }
                ]
            }
        }
    ]
}
EOF
)

# ============================================================================
# ENVIRONMENTS
# ============================================================================

ENVIRONMENTS=(staging production)

view_environment() {
    local env_name=$1

    echo
    echo "Environment '$env_name':"

    local result
    if ! result=$(gh api "/repos/$REPO/environments/$env_name" 2>/dev/null); then
        echo "  (not found)"
        return
    fi

    echo "$result" | jq '{
        id: .id,
        name: .name,
        protection_rules: .protection_rules,
        deployment_branch_policy: .deployment_branch_policy
    }' | sed 's/^/  /'
}

apply_environment() {
    local env_name=$1

    echo
    echo "Environment '$env_name':"

    local exists
    if exists=$(gh api "/repos/$REPO/environments/$env_name" 2>/dev/null); then
        # Environment exists
        if [ "$DRY_RUN" = "true" ]; then
            echo "  Action: SKIP (already exists)"
            echo "  Current config:"
            echo "$exists" | jq '{
                id: .id,
                protection_rules: .protection_rules,
                deployment_branch_policy: .deployment_branch_policy
            }' | sed 's/^/    /'
        else
            echo "  Already exists"
        fi
    else
        # Environment does not exist
        if [ "$DRY_RUN" = "true" ]; then
            echo "  Action: CREATE"
        else
            gh api --method PUT "/repos/$REPO/environments/$env_name" > /dev/null
            echo "  Created"
        fi
    fi
}

# ============================================================================
# EXECUTE
# ============================================================================

echo "Repository: $REPO"

# Rulesets
if [ "$RESOURCE" = "rulesets" ]; then
    # Determine which branches to process
    if [ -n "$SCOPE" ]; then
        branches_to_process=("$SCOPE")
    else
        branches_to_process=("${BRANCHES[@]}")
    fi

    for branch in "${branches_to_process[@]}"; do
        if [ "$COMMAND" = "view" ]; then
            view_ruleset "$branch"
        elif [ "$COMMAND" = "apply" ]; then
            payload_var="${branch}_payload"
            apply_ruleset "$branch" "${!payload_var}"
        fi
    done
fi

# Environments
if [ "$RESOURCE" = "environments" ]; then
    # Determine which environments to process
    if [ -n "$SCOPE" ]; then
        envs_to_process=("$SCOPE")
    else
        envs_to_process=("${ENVIRONMENTS[@]}")
    fi

    for env_name in "${envs_to_process[@]}"; do
        if [ "$COMMAND" = "view" ]; then
            view_environment "$env_name"
        elif [ "$COMMAND" = "apply" ]; then
            apply_environment "$env_name"
        fi
    done
fi

echo
if [ "$COMMAND" = "apply" ]; then
    if [ "$DRY_RUN" = "true" ]; then
        echo "Dry run complete. No changes were made."
    else
        echo "Done."
    fi
fi
