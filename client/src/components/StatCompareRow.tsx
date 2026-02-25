import React from 'react';
import { getShortName } from '@/utils/team-helpers';

export type TeamLike = { name: string; abbreviation?: string | null };

interface StatCompareRowProps {
  label: string;
  awayValue: number | string | null | undefined;
  homeValue: number | string | null | undefined;
  awayTeam: TeamLike;
  homeTeam: TeamLike;
  lowerIsBetter?: boolean;
  valueFormatter?: (v: number | string) => string;
}

const formatDefault = (v: number | string) => String(v);

const StatCompareRow: React.FC<StatCompareRowProps> = ({
  label,
  awayValue,
  homeValue,
  awayTeam,
  homeTeam,
  lowerIsBetter = false,
  valueFormatter = formatDefault,
}) => {
  const aVal = awayValue == null ? 0 : (typeof awayValue === 'string' ? Number(awayValue) : awayValue);
  const hVal = homeValue == null ? 0 : (typeof homeValue === 'string' ? Number(homeValue) : homeValue);
  const awayBetter = lowerIsBetter ? aVal < hVal : aVal > hVal;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
      <div className={`text-right ${awayBetter ? 'font-bold text-green-600' : ''}`}>
        <div className="text-xs text-gray-500">{getShortName(awayTeam)}</div>
        <div>{valueFormatter(aVal)}</div>
      </div>
      <div className="text-center text-sm font-medium text-gray-700 px-2">
        {label}
      </div>
      <div className={`text-left ${!awayBetter ? 'font-bold text-green-600' : ''}`}>
        <div className="text-xs text-gray-500">{getShortName(homeTeam)}</div>
        <div>{valueFormatter(hVal)}</div>
      </div>
    </div>
  );
};

export default StatCompareRow;
