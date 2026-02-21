import React from 'react';
import { SkillSelector } from '../SkillSelector';
import type { SkillMeta } from '../../api';

interface StepSkillsProps {
  skills: SkillMeta[];
  loadingSkills: boolean;
  selectedSkills: string[];
  onSkillsChange: (selected: string[]) => void;
}

export const StepSkills: React.FC<StepSkillsProps> = ({
  skills,
  loadingSkills,
  selectedSkills,
  onSkillsChange,
}) => {
  const baseSkills = skills.filter((s) => s.tier === 'base');
  const serviceSkills = skills.filter((s) => s.tier === 'service');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Skills & Capabilities
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Select capabilities to inject into your agent. System skills are always included.
        </p>
      </div>

      {loadingSkills ? (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : (
        <>
          {baseSkills.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Base Skills
              </h3>
              <SkillSelector
                skills={baseSkills}
                selected={selectedSkills}
                onChange={onSkillsChange}
              />
            </div>
          )}

          {serviceSkills.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Service Skills
              </h3>
              <SkillSelector
                skills={serviceSkills}
                selected={selectedSkills}
                onChange={onSkillsChange}
              />
            </div>
          )}

          {baseSkills.length === 0 && serviceSkills.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No optional skills available. System skills will be injected automatically.
            </p>
          )}
        </>
      )}
    </div>
  );
};
