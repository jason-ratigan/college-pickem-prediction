// client/src/pages/AdminPage.tsx

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Redirect } from 'wouter';
import Navigation from '@/components/Navigation';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ValidationResult {
  success: boolean;
  overallScore: number;
  message: string;
  processingTimeMs: number;
  validationResults: {
    dataPipeline: { isValid: boolean; score: number; };
    regressionAnalysis: { isValid: boolean; score: number; };
    weightCalculation: { isValid: boolean; score: number; };
    predictionAccuracy: { isValid: boolean; score: number; };
    sampleGameAnalysis: { isValid: boolean; score: number; };
  };
  summary: {
    validComponents: number;
    totalComponents: number;
    criticalIssues: number;
    warnings: number;
    recommendations: number;
  };
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

interface AnalysisReport {
  success: boolean;
  report: {
    executiveSummary: {
      overallSystemHealth: string;
      confidenceInSystem: number;
      keyFindings: string[];
      predictionAccuracySummary: string;
    };
    systemConfidenceAssessment: {
      overallSystemConfidence: {
        score: number;
        level: string;
        explanation: string;
      };
    };
    predictionExamples: {
      successfulPredictions: any[];
      failedPredictions: any[];
      exampleAnalysis: {
        successPatterns: string[];
        failurePatterns: string[];
        lessonsLearned: string[];
      };
    };
    confidenceInterpretationGuide: {
      confidenceLevels: Array<{
        range: [number, number];
        label: string;
        description: string;
        typicalAccuracy: string;
        recommendedUse: string;
      }>;
      interpretationTips: string[];
    };
    recommendationsAndInsights: {
      immediateActions: Array<{
        priority: string;
        title: string;
        description: string;
        expectedImpact: string;
      }>;
    };
  };
}

interface DataStatus {
  lastUpdate: string | null;
  gamesProcessed: number;
  teamsWithSufficientData: number;
  totalTeams: number;
  dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient';
  processingLogs: ProcessingLog[];
}

interface ProcessingLog {
  id: number;
  processType: string;
  season: number;
  startDate: string;
  endDate: string | null;
  gamesProcessed: number | null;
  teamsUpdated: number | null;
  iterationsRequired: number | null;
  converged: boolean | null;
  processingTime: number | null;
}

interface ProcessingResult {
  success: boolean;
  message: string;
  gamesProcessed?: number;
  teamsUpdated?: number;
  iterations?: number;
  converged?: boolean;
  processingTimeMs?: number;
  errors?: string[];
}

const AdminPage = () => {
  // --- CLIENT-SIDE SECURITY CHECK ---
  const { user, isLoading } = useAuth();

  // State management
  const [season, setSeason] = useState(new Date().getFullYear());
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);

  // =============================================================================
  // DATA QUERIES
  // =============================================================================

  const queryClient = useQueryClient();
  
  const { data: dataStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['admin-data-status', season],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/v1/admin/data-status/${season}`);
      return response.json() as Promise<DataStatus>;
    },
    refetchInterval: processingStatus ? 5000 : false, // Poll every 5 seconds during processing
  });

  // =============================================================================
  // MUTATIONS FOR ADMIN OPERATIONS
  // =============================================================================

  const updateRecentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/v1/admin/update-recent-data`);
      return response.json() as Promise<ProcessingResult>;
    },
    onMutate: () => setProcessingStatus('Updating recent data...'),
    onSuccess: (data: ProcessingResult) => {
      setProcessingStatus(null);
      refetchStatus();
      alert(`Success: ${data.message}\nGames processed: ${data.gamesProcessed || 0}`);
      queryClient.invalidateQueries({ queryKey: ["hubData"] });
      queryClient.invalidateQueries({ queryKey: ["gameAnalysis"] });
      queryClient.invalidateQueries({ queryKey: ["currentWeek"] });
      queryClient.invalidateQueries({ queryKey: ["allFilters"] });
    },
    onError: (error) => {
      setProcessingStatus(null);
      alert(`Update Failed: ${error.message}`);
    }
  });

  const processSeasonMutation = useMutation({
    mutationFn: async (year: number) => {
      const response = await apiRequest('POST', `/api/v1/admin/process-full-season/${year}`);
      return response.json() as Promise<ProcessingResult>;
    },
    onMutate: () => setProcessingStatus('Processing full season data...'),
    onSuccess: (data: ProcessingResult) => {
      setProcessingStatus(null);
      refetchStatus();
      alert(`Success: ${data.message}\nGames processed: ${data.gamesProcessed || 0}\nTeams updated: ${data.teamsUpdated || 0}`);
    },
    onError: (error) => {
      setProcessingStatus(null);
      alert(`Season Processing Failed: ${error.message}`);
    }
  });

  const recalculateStatsMutation = useMutation({
    mutationFn: async (year: number) => {
      const response = await apiRequest('POST', `/api/v1/admin/recalculate-statistics/${year}`);
      return response.json() as Promise<ProcessingResult>;
    },
    onMutate: () => setProcessingStatus('Recalculating statistics from existing data...'),
    onSuccess: (data: ProcessingResult) => {
      setProcessingStatus(null);
      refetchStatus();
      alert(`Success: ${data.message}\nTeams updated: ${data.teamsUpdated || 0}`);
    },
    onError: (error) => {
      setProcessingStatus(null);
      alert(`Recalculation Failed: ${error.message}`);
    }
  });

  // REMOVED: recalculateStrengthsMutation - was using broken old system
  // Now only use recalculateStatsMutation which uses correct opponent-relative calculations

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  const handleUpdateRecent = () => updateRecentMutation.mutate();
  const handleProcessFullSeason = () => processSeasonMutation.mutate(season);
  const handleRecalculateStats = () => recalculateStatsMutation.mutate(season);
  // REMOVED: handleRecalculateStrengths - was using broken old system

  // =============================================================================
  // RENDER LOGIC
  // =============================================================================

  if (isLoading) return <div className="p-8 text-center">Checking authorization...</div>;
  if (!user || user.role !== 'admin') return <Redirect to="/" />;

  const isProcessing = updateRecentMutation.isPending || 
                      processSeasonMutation.isPending || 
                      recalculateStatsMutation.isPending;
                      // REMOVED: recalculateStrengthsMutation.isPending

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto p-4 md:p-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Admin Statistics Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage statistical data, trigger calculations, and monitor system status</p>
        </div>

        {processingStatus && (
          <Alert className="mb-6">
            <AlertDescription className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              {processingStatus}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-8">
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">System Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle>Season Selection</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="season-year">Target Season</Label>
                    <Input id="season-year" type="number" value={season} onChange={(e) => setSeason(parseInt(e.target.value, 10))} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Data Status</CardTitle></CardHeader>
                <CardContent>
                  {statusLoading ? (
                    <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
                  ) : dataStatus ? (
                    <div className="space-y-3">
                      <div className="flex justify-between"><span className="text-sm text-gray-600">Last Update:</span><span className="text-sm font-medium">{dataStatus.lastUpdate ? new Date(dataStatus.lastUpdate).toLocaleDateString() : 'Never'}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-gray-600">Games Processed:</span><span className="text-sm font-medium">{dataStatus.gamesProcessed}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-gray-600">Teams with Data:</span><span className="text-sm font-medium">{dataStatus.teamsWithSufficientData} / {dataStatus.totalTeams}</span></div>
                      <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Data Quality:</span><Badge variant={dataStatus.dataQuality === 'Excellent' ? 'default' : dataStatus.dataQuality === 'Good' ? 'secondary' : dataStatus.dataQuality === 'Limited' ? 'outline' : 'destructive'}>{dataStatus.dataQuality}</Badge></div>
                    </div>
                  ) : <p className="text-sm text-gray-500">No data available</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>System Health</CardTitle></CardHeader>
                <CardContent>
                  <ValidationHealthCheck season={season} />
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Data Processing & Analysis</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle>Update Recent Data</CardTitle><CardDescription>Fetch and process games from the past 2 weeks</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-gray-600"><p>• Fetches recent completed games</p><p>• Updates box score statistics</p><p>• Fast operation (1-2 minutes)</p></div>
                  <Button onClick={handleUpdateRecent} disabled={isProcessing} className="w-full">{updateRecentMutation.isPending ? (<div className="flex items-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Updating...</div>) : ('Update Recent Data')}</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Recalculate Statistics</CardTitle><CardDescription>Re-run opponent-relative efficiency calculations on existing data</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-gray-600"><p>• Uses existing box scores</p><p className="font-bold text-green-600">• No new API calls</p><p>• Opponent-relative efficiency calculations</p><p>• Fast operation (1-2 minutes)</p></div>
                  <Button onClick={handleRecalculateStats} disabled={isProcessing} variant="secondary" className="w-full">{recalculateStatsMutation.isPending ? (<div className="flex items-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>Recalculating...</div>) : (`Recalculate ${season} Stats`)}</Button>
                </CardContent>
              </Card>
              {/* REMOVED: Recalculate Strengths card - was using broken old system */}
              <Card>
                <CardHeader><CardTitle>Process Full Season</CardTitle><CardDescription>Comprehensive data fetch & processing for entire season</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-gray-600"><p>• Fetches all games for {season} season</p><p>• Processes all statistical data</p><p>• Long operation (10-15 minutes)</p></div>
                  <Button onClick={handleProcessFullSeason} disabled={isProcessing} variant="destructive" className="w-full">{processSeasonMutation.isPending ? (<div className="flex items-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Processing...</div>) : (`Process ${season} Season`)}</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Analysis Report</CardTitle><CardDescription>Generate comprehensive validation report</CardDescription></CardHeader>
                <CardContent>
                  <ValidationAnalysisReport season={season} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Component Testing</CardTitle><CardDescription>Test individual validation components</CardDescription></CardHeader>
                <CardContent>
                  <ValidationComponentTester season={season} />
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Advanced Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle>Repopulate Games by API ID</CardTitle><CardDescription>Upsert specific games by their API IDs</CardDescription></CardHeader>
                <CardContent><RepopulateGamesForm /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Reconcile Season Schedule</CardTitle><CardDescription>Fetch entire season schedule from API</CardDescription></CardHeader>
                <CardContent><ScheduleReconcileControls defaultSeason={season} /></CardContent>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

// --- Local component: Repopulate Games Form ---
const RepopulateGamesForm = () => {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const ids = input.split(',').map(s => s.trim()).filter(s => s.length > 0).map(s => Number(s)).filter(n => !isNaN(n));
    if (ids.length === 0) {
      alert('Please enter one or more numeric API game IDs, separated by commas.');
      return;
    }
    if (!confirm(`Repopulate ${ids.length} game(s) by API ID?`)) return;

    try {
      setIsSubmitting(true);
      const response = await apiRequest('POST', '/api/v1/admin/repopulate-games-by-api-ids', { apiGameIds: ids });
      const json = await response.json();
      setResult(json);
      alert(json.message || 'Operation completed');
    } catch (err: any) {
      alert(err?.message || 'Request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="repop-ids">API Game IDs</Label>
      <Input id="repop-ids" placeholder="e.g., 401635525, 401635526" value={input} onChange={(e) => setInput(e.target.value)} disabled={isSubmitting} />
      <div className="flex gap-2"><Button onClick={handleSubmit} disabled={isSubmitting} size="sm">{isSubmitting ? 'Processing...' : 'Repopulate'}</Button></div>
      {result && (
        <div className="text-xs text-gray-600">
          <div>Processed: {result.processed}</div>
          <div>Upserted: {result.upserted}</div>
          <div>Missing team mappings: {result.missingTeamMappings?.length || 0}</div>
          {result.missingTeamMappings?.length > 0 && (<div className="mt-1"><div className="font-medium">Missing mappings:</div><ul className="list-disc ml-6">{result.missingTeamMappings.map((m: any) => (<li key={m.apiGameId}>Game {m.apiGameId}: homeId {m.homeId}, awayId {m.awayId}</li>))}</ul></div>)}
          {result.errors?.length > 0 && (<div className="mt-1 text-red-600"><div className="font-medium">Errors:</div><ul className="list-disc ml-6">{result.errors.map((e: string, idx: number) => (<li key={idx}>{e}</li>))}</ul></div>)}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// VALIDATION COMPONENTS
// =============================================================================

const ValidationHealthCheck = ({ season }: { season: number }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ValidationResult | null>(null);

  const runHealthCheck = async () => {
    setIsRunning(true);
    try {
      const response = await apiRequest('POST', `/api/v1/admin/validation/comprehensive/${season}`);
      const result = await response.json() as ValidationResult;
      setLastResult(result);
      
      // Show summary alert
      const status = result.overallScore >= 80 ? '🟢 Excellent' : 
                   result.overallScore >= 70 ? '🟡 Good' : 
                   result.overallScore >= 50 ? '🟠 Needs Attention' : '🔴 Critical';
      
      alert(`System Health Check Complete!\n\nOverall Score: ${result.overallScore}%\nStatus: ${status}\nValid Components: ${result.summary.validComponents}/${result.summary.totalComponents}\nProcessing Time: ${result.processingTimeMs}ms`);
    } catch (error: any) {
      alert(`Health Check Failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button 
        onClick={runHealthCheck} 
        disabled={isRunning} 
        className="w-full"
        variant={lastResult?.overallScore ? (lastResult.overallScore >= 70 ? 'default' : 'destructive') : 'default'}
      >
        {isRunning ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Running Health Check...
          </div>
        ) : (
          'Run System Health Check'
        )}
      </Button>
      
      {lastResult && (
        <div className="text-xs space-y-2 p-3 bg-gray-50 rounded">
          <div className="flex justify-between">
            <span className="font-medium">Overall Score:</span>
            <Badge variant={lastResult.overallScore >= 70 ? 'default' : 'destructive'}>
              {lastResult.overallScore}%
            </Badge>
          </div>
          <div className="flex justify-between">
            <span>Valid Components:</span>
            <span>{lastResult.summary.validComponents}/{lastResult.summary.totalComponents}</span>
          </div>
          <div className="flex justify-between">
            <span>Issues:</span>
            <span>{lastResult.summary.criticalIssues} errors, {lastResult.summary.warnings} warnings</span>
          </div>
          <div className="text-xs text-gray-500">
            Last run: {new Date().toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};

const ValidationAnalysisReport = ({ season }: { season: number }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastReport, setLastReport] = useState<AnalysisReport | null>(null);

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const response = await apiRequest('GET', `/api/v1/admin/validation/analysis-report/${season}`);
      const result = await response.json() as AnalysisReport;
      setLastReport(result);
      
      // Show summary alert
      const report = result.report;
      alert(`Analysis Report Generated!\n\nSystem Health: ${report.executiveSummary.overallSystemHealth}\nConfidence: ${report.executiveSummary.confidenceInSystem}%\nKey Findings: ${report.executiveSummary.keyFindings.length}\nRecommendations: ${report.recommendationsAndInsights.immediateActions.length}`);
    } catch (error: any) {
      alert(`Report Generation Failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadReport = () => {
    if (!lastReport) return;
    
    const reportText = [
      'REGRESSION ANALYSIS VALIDATION REPORT',
      '=' .repeat(50),
      `Generated: ${new Date().toLocaleString()}`,
      `Season: ${season}`,
      '',
      'EXECUTIVE SUMMARY:',
      `System Health: ${lastReport.report.executiveSummary.overallSystemHealth}`,
      `Confidence: ${lastReport.report.executiveSummary.confidenceInSystem}%`,
      '',
      'KEY FINDINGS:',
      ...lastReport.report.executiveSummary.keyFindings.map((f, i) => `${i + 1}. ${f}`),
      '',
      'PREDICTION ACCURACY:',
      lastReport.report.executiveSummary.predictionAccuracySummary,
      '',
      'SYSTEM CONFIDENCE:',
      `Overall: ${lastReport.report.systemConfidenceAssessment.overallSystemConfidence.score}% (${lastReport.report.systemConfidenceAssessment.overallSystemConfidence.level})`,
      lastReport.report.systemConfidenceAssessment.overallSystemConfidence.explanation,
      '',
      'CONFIDENCE INTERPRETATION GUIDE:',
      ...lastReport.report.confidenceInterpretationGuide.confidenceLevels.map(level => 
        `${level.range[0]}-${level.range[1]}%: ${level.label} - ${level.description}`
      ),
      '',
      'INTERPRETATION TIPS:',
      ...lastReport.report.confidenceInterpretationGuide.interpretationTips.map((tip, i) => `${i + 1}. ${tip}`),
      '',
      'IMMEDIATE ACTIONS:',
      ...lastReport.report.recommendationsAndInsights.immediateActions.map((action, i) => 
        `${i + 1}. [${action.priority.toUpperCase()}] ${action.title}: ${action.description}`
      )
    ].join('\n');
    
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-report-${season}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <Button 
        onClick={generateReport} 
        disabled={isGenerating} 
        className="w-full"
        variant="secondary"
      >
        {isGenerating ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
            Generating Report...
          </div>
        ) : (
          'Generate Analysis Report'
        )}
      </Button>
      
      {lastReport && (
        <Button 
          onClick={downloadReport} 
          variant="outline" 
          size="sm" 
          className="w-full"
        >
          📄 Download Report
        </Button>
      )}
      
      {lastReport && (
        <div className="text-xs space-y-2 p-3 bg-gray-50 rounded">
          <div className="flex justify-between">
            <span className="font-medium">System Health:</span>
            <Badge variant={lastReport.report.executiveSummary.overallSystemHealth === 'excellent' || lastReport.report.executiveSummary.overallSystemHealth === 'good' ? 'default' : 'destructive'}>
              {lastReport.report.executiveSummary.overallSystemHealth}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span>Confidence:</span>
            <span>{lastReport.report.executiveSummary.confidenceInSystem}%</span>
          </div>
          <div className="flex justify-between">
            <span>Key Findings:</span>
            <span>{lastReport.report.executiveSummary.keyFindings.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Successful Examples:</span>
            <span>{lastReport.report.predictionExamples.successfulPredictions.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Failed Examples:</span>
            <span>{lastReport.report.predictionExamples.failedPredictions.length}</span>
          </div>
          <div className="text-xs text-gray-500">
            Last generated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};

const ValidationComponentTester = ({ season }: { season: number }) => {
  const [selectedComponent, setSelectedComponent] = useState('prediction-accuracy');
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const components = [
    { id: 'data-pipeline', name: 'Data Pipeline', description: 'Validates raw data quality' },
    { id: 'regression-analysis', name: 'Regression Analysis', description: 'Audits statistical models' },
    { id: 'weight-calculation', name: 'Weight Calculation', description: 'Verifies weight derivation' },
    { id: 'prediction-accuracy', name: 'Prediction Accuracy', description: 'Tests prediction performance' },
    { id: 'sample-game-analysis', name: 'Sample Game Analysis', description: 'Analyzes specific games' }
  ];

  const runComponentTest = async () => {
    setIsRunning(true);
    try {
      const response = await apiRequest('POST', `/api/v1/admin/validation/${selectedComponent}/${season}`);
      const result = await response.json();
      setLastResult(result);
      
      const componentName = components.find(c => c.id === selectedComponent)?.name || selectedComponent;
      const status = result.result.isValid ? '✅ PASSED' : '❌ FAILED';
      const score = result.result.score ? ` (${result.result.score}/100)` : '';
      
      alert(`${componentName} Test Complete!\n\nStatus: ${status}${score}\nProcessing Time: ${result.processingTimeMs}ms`);
    } catch (error: any) {
      alert(`Component Test Failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="component-select">Component</Label>
        <select 
          id="component-select"
          className="border rounded px-2 py-2 w-full bg-white mt-1"
          value={selectedComponent}
          onChange={(e) => setSelectedComponent(e.target.value)}
        >
          {components.map(comp => (
            <option key={comp.id} value={comp.id}>
              {comp.name} - {comp.description}
            </option>
          ))}
        </select>
      </div>
      
      <Button 
        onClick={runComponentTest} 
        disabled={isRunning} 
        className="w-full"
        variant="outline"
      >
        {isRunning ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
            Testing Component...
          </div>
        ) : (
          'Test Component'
        )}
      </Button>
      
      {lastResult && (
        <div className="text-xs space-y-2 p-3 bg-gray-50 rounded">
          <div className="flex justify-between">
            <span className="font-medium">Component:</span>
            <span>{lastResult.validatorName}</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <Badge variant={lastResult.result.isValid ? 'default' : 'destructive'}>
              {lastResult.result.isValid ? 'PASSED' : 'FAILED'}
            </Badge>
          </div>
          {lastResult.result.score && (
            <div className="flex justify-between">
              <span>Score:</span>
              <span>{lastResult.result.score}/100</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Processing Time:</span>
            <span>{lastResult.processingTimeMs}ms</span>
          </div>
          <div className="text-xs text-gray-500">
            Last run: {new Date().toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Local Component: Schedule Reconcile Controls ---
const ScheduleReconcileControls = ({ defaultSeason }: { defaultSeason: number }) => {
  const [year, setYear] = useState<number>(defaultSeason);
  const [destructive, setDestructive] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const run = async () => {
    if (!year || isNaN(Number(year))) {
      alert('Enter a valid season year');
      return;
    }
    if (destructive && !confirm(`Destructive reset will delete existing ${year} games, picks, and stats before upserting. Continue?`)) return;
    try {
      setIsSubmitting(true);
      const url = `/api/v1/admin/reconcile-season-schedule/${year}${destructive ? '?destructive=true' : ''}`;
      const response = await apiRequest('POST', url);
      const json = await response.json();
      setResult(json);
      alert(`Reconciled season ${year}. Upserted: ${json.upserted}. Removed: ${json.removed}. API games: ${json.apiGames}.`);
    } catch (err: any) {
      alert(err?.message || 'Request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <Label htmlFor="recon-season">Season</Label>
          <Input id="recon-season" type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} />
        </div>
        <div>
          <Label htmlFor="recon-mode">Mode</Label>
          <select id="recon-mode" className="border rounded px-2 py-2 w-full bg-white" value={destructive ? 'destructive' : 'non-destructive'} onChange={(e) => setDestructive(e.target.value === 'destructive')}>
            <option value="non-destructive">Non-destructive (remove missing, upsert existing)</option>
            <option value="destructive">Destructive reset (clear season, then upsert)</option>
          </select>
        </div>
        <div><Button onClick={run} disabled={isSubmitting} className="w-full">{isSubmitting ? 'Reconciling...' : 'Reconcile Season'}</Button></div>
      </div>
      {result && (
        <div className="text-xs text-gray-600">
          <div>API games: {result.apiGames}</div>
          <div>Upserted: {result.upserted}</div>
          <div>Removed: {result.removed}</div>
          {result.errors?.length > 0 && (<div className="mt-1 text-red-600"><div className="font-medium">Errors:</div><ul className="list-disc ml-6">{result.errors.map((e: string, idx: number) => (<li key={idx}>{e}</li>))}</ul></div>)}
        </div>
      )}
    </div>
  );
};

export default AdminPage;