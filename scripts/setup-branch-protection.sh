#!/bin/bash
set -e

# Manage branch rulesets for master and develop branches.
# Requires: gh CLI authenticated with admin permissions

show_help() {
    cat <<EOF
Usage: ./scripts/setup-branch-protection.sh [command] [options] [branch...]

Manage branch rulesets for master and develop branches.

Commands:
  view        Show current ruleset settings from GitHub
  apply       Apply ruleset settings to GitHub

Arguments:
  branch      Branch to target (master, develop). If omitted, targets both.

Options:
  --help      Show this help message
  --dry-run   Preview changes without applying (only for 'apply')

Examples:
  ./scripts/setup-branch-protection.sh view               # view both
  ./scripts/setup-branch-protection.sh view master        # view master only
  ./scripts/setup-branch-protection.sh apply              # apply both
  ./scripts/setup-branch-protection.sh apply --dry-run    # preview both
  ./scripts/setup-branch-protection.sh apply develop      # apply develop only

Requirements:
  - gh CLI installed and authenticated
  - Admin permissions on the repository

Rulesets:
  master-protection:
    - Require PR before merging (1 approval, dismiss stale reviews)
    - Require status checks to pass (must be up to date)
    - Block force pushes
    - Restrict deletions
    - Admins can bypass

  develop-protection:
    - Require PR before merging (no approval required)
    - Require status checks to pass (not required to be up to date)
    - Allow force pushes
    - Restrict deletions
    - Admins can bypass
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
BRANCHES=()

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
        master|develop)
            BRANCHES+=("$arg")
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Command is required
if [ -z "$COMMAND" ]; then
    echo "Error: command required (view or apply)"
    echo "Use --help for usage information"
    exit 1
fi

# Default to both branches if none specified
if [ ${#BRANCHES[@]} -eq 0 ]; then
    BRANCHES=(master develop)
fi

# Validate --dry-run is only used with apply
if [ "$DRY_RUN" = "true" ] && [ "$COMMAND" != "apply" ]; then
    echo "Error: --dry-run can only be used with 'apply' command"
    exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Map branch names to ruleset names
get_ruleset_name() {
    echo "$1-protection"
}

# Get ruleset ID by name
get_ruleset_id() {
    local name=$1
    gh api "/repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id" 2>/dev/null || echo ""
}

# View command: fetch and display current ruleset
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

# Apply command: create or update ruleset
apply_ruleset() {
    local branch=$1
    local payload=$2
    local name=$(get_ruleset_name "$branch")
    local ruleset_id=$(get_ruleset_id "$name")

    # Inject the name into the payload
    payload=$(echo "$payload" | jq --arg name "$name" '.name = $name')

    echo
    echo "Ruleset '$name':"

    if [ "$DRY_RUN" = "true" ]; then
        if [ -n "$ruleset_id" ]; then
            echo "  Would UPDATE existing ruleset (id: $ruleset_id):"
        else
            echo "  Would CREATE new ruleset:"
        fi
        echo "$payload" | jq . | sed 's/^/    /'
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

# Ruleset payloads
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
                    { "context": "validate" }
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
                    { "context": "validate" }
                ]
            }
        }
    ]
}
EOF
)

# Execute command
echo "Repository: $REPO"

for branch in "${BRANCHES[@]}"; do
    if [ "$COMMAND" = "view" ]; then
        view_ruleset "$branch"
    elif [ "$COMMAND" = "apply" ]; then
        payload_var="${branch}_payload"
        apply_ruleset "$branch" "${!payload_var}"
    fi
done

echo
if [ "$COMMAND" = "apply" ]; then
    if [ "$DRY_RUN" = "true" ]; then
        echo "Dry run complete. No changes were made."
    else
        echo "Done."
    fi
fi
