type AiSettingsHeaderProps = {
  description?: string;
  title: string;
};

export function AiSettingsHeader({ description, title }: AiSettingsHeaderProps) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold" id="ai-settings-title">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </div>
  );
}