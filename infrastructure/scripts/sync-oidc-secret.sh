#!/usr/bin/env bash
# Pushes OIDC_CONFIG + OIDC_CLIENT_SECRET (from GitHub Environment vars/secrets) into
# the Secrets Manager secret whose shape is provisioned by ApiGatewayStack (CDK).
set -euo pipefail

: "${TIER:?TIER is required}"
: "${OIDC_CONFIG:?OIDC_CONFIG is required}"
: "${OIDC_CLIENT_SECRET:?OIDC_CLIENT_SECRET is required}"

SECRET_NAME="${TIER}/fhhpb/oidc-config"

# OIDC_CONFIG is dotenv-style KEY=VALUE lines (same shape as the old *-oidc.env
# files, minus CLIENT_SECRET) — turn it into a JSON object before merging.
CONFIG_JSON=$(printf '%s' "$OIDC_CONFIG" | jq -R -s '
  split("\n")
  | map(select(length > 0 and (startswith("#") | not)))
  | map(capture("^(?<key>[^=]+)=(?<value>.*)$"))
  | from_entries
')

SECRET_STRING=$(jq -n \
  --argjson config "$CONFIG_JSON" \
  --arg secret "$OIDC_CLIENT_SECRET" \
  '$config + {CLIENT_SECRET: $secret}')

aws secretsmanager put-secret-value \
  --secret-id "$SECRET_NAME" \
  --secret-string "$SECRET_STRING" \
  --region us-east-1 \
  --query "{ARN:ARN,VersionId:VersionId}" \
  --output table
