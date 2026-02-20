import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSkills, useCreateAgent } from '../hooks/use-agents';
import { SkillSelector } from '../components/SkillSelector';
import { cn } from '../utils';

const MODEL_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama (local)' },
];

export const Builder: React.FC = () => {
  const navigate = useNavigate();
  const { data: skills, isLoading: loadingSkills } = useSkills();
  const createAgent = useCreateAgent();

  const [name, setName] = useState('');
  const [persona, setPersona] = useState('');
  const [model, setModel] = useState('openrouter');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const canSubmit = name.trim() && persona.trim() && !createAgent.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      const agent = await createAgent.mutateAsync({
        name: name.trim(),
        persona: persona.trim(),
        modelProvider: model,
        skills: selectedSkills,
      });
      navigate(`/agents/${agent.id}`);
    } catch {
      // error handled by mutation state
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-foreground">Create Agent</h1>
        <p className="text-sm text-muted-foreground">
          Configure your agent's identity, model, and capabilities
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Identity */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Identity
          </h2>
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="MantleDegen"
              className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Persona</label>
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="You are a ruthless crypto degen on Mantle network. You hunt for the best DeFi yields and deploy meme tokens..."
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </section>

        {/* Model */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Model Provider
          </h2>
          <div className="flex gap-2">
            {MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setModel(opt.value)}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm transition-colors',
                  model === opt.value
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/30',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Skills */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Skills
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Select capabilities to inject into your agent's knowledge base
            </p>
          </div>
          {loadingSkills ? (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          ) : (
            <SkillSelector
              skills={skills || []}
              selected={selectedSkills}
              onChange={setSelectedSkills}
            />
          )}
        </section>

        {/* Submit */}
        {createAgent.isError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
            Failed to create agent. Please try again.
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'w-full rounded-lg py-3 text-sm font-semibold transition-colors',
            canSubmit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {createAgent.isPending ? 'Deploying...' : 'Deploy Agent'}
        </button>
      </form>
    </div>
  );
};
