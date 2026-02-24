import React, { useMemo, useState } from 'react';
import type { SocialConfigPayload } from '../../api';
import { cn } from '../../utils';

type SocialPlatform = 'telegram' | 'discord';

interface StepSocialProps {
  config: SocialConfigPayload;
  support: { telegram: boolean; discord: boolean };
  onChange: (config: SocialConfigPayload) => void;
  onTestConnection: (
    platform: SocialPlatform,
    token: string,
  ) => Promise<{ ok: boolean; message: string }>;
}

export const StepSocial: React.FC<StepSocialProps> = ({
  config,
  support,
  onChange,
  onTestConnection,
}) => {
  const [testing, setTesting] = useState<SocialPlatform | null>(null);
  const [testMessage, setTestMessage] = useState<
    Partial<Record<SocialPlatform, { ok: boolean; message: string }>>
  >({});

  const availablePlatforms = useMemo(
    () => ({
      telegram: support.telegram,
      discord: support.discord,
    }),
    [support],
  );

  const update = (partial: Partial<SocialConfigPayload>) =>
    onChange({ ...config, ...partial });

  const updateTelegram = (partial: Partial<SocialConfigPayload['telegram']>) =>
    onChange({ ...config, telegram: { ...config.telegram, ...partial } });

  const updateDiscord = (partial: Partial<SocialConfigPayload['discord']>) =>
    onChange({ ...config, discord: { ...config.discord, ...partial } });

  const updateBase = (partial: Partial<SocialConfigPayload['base']>) =>
    onChange({ ...config, base: { ...config.base, ...partial } });

  async function handleTest(platform: SocialPlatform, token: string) {
    const trimmedToken = token.trim();
    if (!trimmedToken) return;
    setTesting(platform);
    setTestMessage((prev) => ({ ...prev, [platform]: undefined }));
    try {
      const result = await onTestConnection(platform, trimmedToken);
      setTestMessage((prev) => ({
        ...prev,
        [platform]: { ok: result.ok, message: result.message },
      }));
    } finally {
      setTesting(null);
    }
  }

  if (!availablePlatforms.telegram && !availablePlatforms.discord) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select social integration skills in the previous step to configure Telegram/Discord.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Social Apps
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure bot channels for in-app agent control and alerts. You can test credentials
          before deploying.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <p className="text-sm font-medium text-foreground">Shared behavior</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Command Prefix</label>
            <input
              type="text"
              value={config.base.commandPrefix}
              onChange={(e) => updateBase({ commandPrefix: e.target.value })}
              placeholder="/"
              maxLength={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Response Visibility</label>
            <select
              value={config.base.responseVisibility}
              onChange={(e) =>
                updateBase({
                  responseVisibility: e.target.value === 'ephemeral' ? 'ephemeral' : 'public',
                })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="public">Public</option>
              <option value="ephemeral">Ephemeral</option>
            </select>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={config.base.enableDmFallback}
            onChange={(e) => updateBase({ enableDmFallback: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-border bg-background"
          />
          Enable direct-message fallback for command responses
        </label>
      </div>

      {availablePlatforms.telegram && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Telegram</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use your bot token and allowlist chat IDs that can control the agent.
              </p>
            </div>
            <Toggle
              checked={config.telegram.enabled}
              onChange={(value) => updateTelegram({ enabled: value })}
            />
          </div>

          {config.telegram.enabled && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Bot Token</label>
                <input
                  type="password"
                  value={config.telegram.botToken}
                  onChange={(e) => updateTelegram({ botToken: e.target.value })}
                  placeholder="123456:ABCDEF..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    Allowed Chat IDs
                  </label>
                  <input
                    type="text"
                    value={config.telegram.allowedChatIds}
                    onChange={(e) => updateTelegram({ allowedChatIds: e.target.value })}
                    placeholder="-100123456, 12345678"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    Default Chat ID
                  </label>
                  <input
                    type="text"
                    value={config.telegram.defaultChatId}
                    onChange={(e) => updateTelegram({ defaultChatId: e.target.value })}
                    placeholder="-100123456"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Mode</label>
                  <select
                    value={config.telegram.webhookMode}
                    onChange={(e) =>
                      updateTelegram({
                        webhookMode: e.target.value === 'webhook' ? 'webhook' : 'polling',
                      })
                    }
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="polling">Polling</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleTest('telegram', config.telegram.botToken)}
                  disabled={testing === 'telegram' || !config.telegram.botToken.trim()}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {testing === 'telegram' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {testMessage.telegram && (
                <p
                  className={cn(
                    'text-xs',
                    testMessage.telegram.ok ? 'text-green-400' : 'text-red-400',
                  )}
                >
                  {testMessage.telegram.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {availablePlatforms.discord && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Discord</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure guild scope and admin roles for slash-command control.
              </p>
            </div>
            <Toggle
              checked={config.discord.enabled}
              onChange={(value) => updateDiscord({ enabled: value })}
            />
          </div>

          {config.discord.enabled && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Bot Token</label>
                <input
                  type="password"
                  value={config.discord.botToken}
                  onChange={(e) => updateDiscord({ botToken: e.target.value })}
                  placeholder="Discord bot token"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Guild ID</label>
                  <input
                    type="text"
                    value={config.discord.guildId}
                    onChange={(e) => updateDiscord({ guildId: e.target.value })}
                    placeholder="123456789012345678"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    Control Channel ID
                  </label>
                  <input
                    type="text"
                    value={config.discord.controlChannelId}
                    onChange={(e) => updateDiscord({ controlChannelId: e.target.value })}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    Notify Channel ID
                  </label>
                  <input
                    type="text"
                    value={config.discord.notifyChannelId}
                    onChange={(e) => updateDiscord({ notifyChannelId: e.target.value })}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    Admin Role IDs
                  </label>
                  <input
                    type="text"
                    value={config.discord.adminRoleIds}
                    onChange={(e) => updateDiscord({ adminRoleIds: e.target.value })}
                    placeholder="role_id_a, role_id_b"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleTest('discord', config.discord.botToken)}
                  disabled={testing === 'discord' || !config.discord.botToken.trim()}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {testing === 'discord' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {testMessage.discord && (
                <p
                  className={cn(
                    'text-xs',
                    testMessage.discord.ok ? 'text-green-400' : 'text-red-400',
                  )}
                >
                  {testMessage.discord.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          update({
            telegram: { ...config.telegram, enabled: false },
            discord: { ...config.discord, enabled: false },
          })
        }
        className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Disable all social channels for now
      </button>
    </div>
  );
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
