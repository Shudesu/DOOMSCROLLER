interface DecisionBadgeProps {
  decision: string | null;
}

export default function DecisionBadge({ decision }: DecisionBadgeProps) {
  if (!decision) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        未判定
      </span>
    );
  }

  const styles = {
    keep: 'bg-green-100 text-green-800',
    skip: 'bg-red-100 text-red-800',
    later: 'bg-yellow-100 text-yellow-800',
  };

  const labels = {
    keep: 'Keep',
    skip: 'Skip',
    later: 'Later',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[decision as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}
    >
      {labels[decision as keyof typeof labels] || decision}
    </span>
  );
}
