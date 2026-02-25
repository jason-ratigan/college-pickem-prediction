// client/src/pages/AdminStatisticsPage.tsx

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Redirect } from 'wouter';
import Navigation from '@/components/Navigation';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, RefreshCw, Save, History, BarChart3 } from 'lucide-react';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface RegressionAnalysisResult {
  metric: string;
  rSquared: number;
  pValue: number;
  coefficient: number;
  confidenceInterval: [number, number];
  weight: number;
  isStatisticallySignificant: boolean;
  predictivePower: 'High' | 'Medium' | 'Low';
}

interface RegressionAnalysisResponse {
  season: number;
  analysisDate: string;
  overallModelRSquared: number;
  predictiveAccuracy: number;
  sampleSize: number;
  metricAnalysis: RegressionAnalysisResult[];
  recommendedWeights: Record<string, number>;
  modelValidation: any;
  significantMetricsCount: number;
  totalMetricsAnalyzed: number;
}

interface WeightChangeEntry {
  id: number;
  timestamp: string;
  reason: string;
  changedBy: number;
  regressionMetrics: {
    rSquared: number;
    sampleSize: number;
    significantMetrics: string[];
  };
  weightChanges: Array<{
    metric: string;
    oldWeight: number;
    newWeight: number;
    change: number;
  }>;
}

interface PredictionWeightsResponse {
  season: number;
  currentWeights: Record<string, number>;
  lastUpdated: string | null;
  weightHistory: WeightChangeEntry[];
  regressionAnalysis: {
    overallRSquared: number;
    sampleSize: number;
    recommendedWeights: Record<string, number>;
    lastAnalysisDate: string;
  } | null;
  recommendations: Array<{
    metric: string;
    currentWeight: number;
    recommendedWeight: number;
    reason: string;
    priority: 'High' | 'Medium' | 'Low';
  }>;
}

const AdminStatisticsPage = () => {
  // --- CLIENT-SIDE SECURITY CHECK ---
  const { user, isLoading: authLoading } = useAuth();
  const [match, params] = useRoute('/admin/statistics/:season');
  const initialSeason = params?.season ? parseInt(params.season, 10) : new Date().getFullYear();
  const [season, setSeason] = useState(initialSeason);

  // State management
  const [activeTab, setActiveTab] = useState('overview');
  const [editingWeights, setEditingWeights] = useState<Record<string, number>>({});
  const [isEditMode, setIsEditMode] = useState(false);

  const queryClient = useQueryClient();

  // =============================================================================
  // DATA QUERIES
  // =============================================================================

  const { data: regressionResults, isLoading: regressionLoading, refetch: refetchRegression } = useQuery({
    queryKey: ['admin-regression-results', season],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/v1/admin/regression-results/${season}`);
      if (response.status === 404) {
        return null;
      }
      return response.json() as Promise<RegressionAnalysisResponse>;
    },
    retry: false
  });

  const { data: weightsData, isLoading: weightsLoading, refetch: refetchWeights } = useQuery({
    queryKey: ['admin-prediction-weights', season],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/v1/admin/prediction-weights/${season}`);
      return response.json() as Promise<PredictionWeightsResponse>;
    }
  });

  // Initialize editing weights when data loads
  useEffect(() => {
    if (weightsData?.currentWeights && !isEditMode) {
      setEditingWeights(weightsData.currentWeights);
    }
  }, [weightsData?.currentWeights, isEditMode]);

  // =============================================================================
  // MUTATIONS FOR ADMIN OPERATIONS
  // =============================================================================

  const runRegressionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/v1/admin/run-regression-analysis/${season}`);
      return response.json();
    },
    onSuccess: () => {
      // Poll for results after starting analysis
      setTimeout(() => {
        refetchRegression();
        refetchWeights();
      }, 2000);
    },
    onError: (error) => {
      const message = error.message.includes('Insufficient data') 
        ? `Insufficient data for ${season} season. Need at least 30 completed games for regression analysis.`
        : `Regression Analysis Failed: ${error.message}`;
      alert(message);
    }
  });

  const updateWeightsMutation = useMutation({
    mutationFn: async (weights: Record<string, number>) => {
      const response = await apiRequest('POST', `/api/v1/admin/update-weights/${season}`, {
        weights,
        reason: 'Manual update via admin dashboard'
      });
      return response.json();
    },
    onSuccess: () => {
      setIsEditMode(false);
      refetchWeights();
      queryClient.invalidateQueries({ queryKey: ["gameAnalysis"] });
      alert('Weights updated successfully');
    },
    onError: (error) => {
      alert(`Weight Update Failed: ${error.message}`);
    }
  });

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  const handleRunRegression = () => {
    if (confirm(`Run regression analysis for ${season} season? This will analyze statistical correlations and may update prediction weights.`)) {
      runRegressionMutation.mutate();
    }
  };

  const handleSaveWeights = () => {
    if (confirm('Save the current weight changes? This will affect all future predictions.')) {
      updateWeightsMutation.mutate(editingWeights);
    }
  };

  const handleCancelEdit = () => {
    setEditingWeights(weightsData?.currentWeights || {});
    setIsEditMode(false);
  };

  const handleWeightChange = (metric: string, value: number) => {
    setEditingWeights(prev => ({
      ...prev,
      [metric]: Math.max(0, Math.min(1, value)) // Clamp between 0 and 1
    }));
  };

  const applyRecommendedWeights = () => {
    if (weightsData?.regressionAnalysis?.recommendedWeights) {
      setEditingWeights(weightsData.regressionAnalysis.recommendedWeights);
      setIsEditMode(true);
    }
  };

  // =============================================================================
  // RENDER LOGIC
  // =============================================================================

  if (authLoading) return <div className="p-8 text-center">Checking authorization...</div>;
  if (!user || user.role !== 'admin') return <Redirect to="/" />;
  if (!match) return <Redirect to="/admin" />;

  const isProcessing = runRegressionMutation.isPending || updateWeightsMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto p-4 md:p-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
            
            {/* Season Selector */}
            <div className="flex items-center gap-2">
              <Label htmlFor="season-select">Season:</Label>
              <select
                id="season-select"
                value={season}
                onChange={(e) => {
                  const newSeason = parseInt(e.target.value, 10);
                  setSeason(newSeason);
                  window.history.pushState({}, '', `/admin/statistics/${newSeason}`);
                }}
                className="border rounded px-3 py-1 bg-white min-w-[100px]"
              >
                {Array.from({ length: 6 }, (_, i) => {
                  const year = new Date().getFullYear() - i;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <h1 className="text-3xl font-bold">Statistical Analysis Dashboard</h1>
          <p className="text-gray-600 mt-2">Season {season} - Regression Analysis & Weight Management</p>
        </div>

        {/* Processing Status */}
        {isProcessing && (
          <Alert className="mb-6">
            <AlertDescription className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              {runRegressionMutation.isPending ? 'Running regression analysis...' : 'Updating weights...'}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="metrics">Metric Analysis</TabsTrigger>
            <TabsTrigger value="weights">Weight Management</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Model Performance Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Model Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {regressionLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : regressionResults ? (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Overall R²:</span>
                        <Badge variant={regressionResults.overallModelRSquared > 0.7 ? 'default' : regressionResults.overallModelRSquared > 0.5 ? 'secondary' : 'destructive'}>
                          {(regressionResults.overallModelRSquared * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Sample Size:</span>
                        <span className="text-sm font-medium">{regressionResults.sampleSize} games</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Prediction Accuracy:</span>
                        <span className="text-sm font-medium">{(regressionResults.predictiveAccuracy * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Significant Metrics:</span>
                        <span className="text-sm font-medium">{regressionResults.significantMetricsCount} / {regressionResults.totalMetricsAnalyzed}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500 mb-3">No regression analysis available for {season}</p>
                      <p className="text-xs text-gray-400 mb-3">Requires at least 30 completed games</p>
                      <Button onClick={handleRunRegression} disabled={isProcessing} size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Run Analysis
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    onClick={handleRunRegression} 
                    disabled={isProcessing} 
                    className="w-full"
                    size="sm"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run Regression Analysis
                  </Button>
                  {weightsData?.regressionAnalysis && (
                    <Button 
                      onClick={applyRecommendedWeights}
                      variant="secondary" 
                      className="w-full"
                      size="sm"
                    >
                      Apply Recommended Weights
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Weight Status Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Weight Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {weightsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : weightsData ? (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Last Updated:</span>
                        <span className="text-sm font-medium">
                          {weightsData.lastUpdated ? new Date(weightsData.lastUpdated).toLocaleDateString() : 'Never'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Total Weights:</span>
                        <span className="text-sm font-medium">{Object.keys(weightsData.currentWeights).length}</span>
                      </div>
                      {weightsData.recommendations && weightsData.recommendations.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Recommendations:</span>
                          <Badge variant="outline">{weightsData.recommendations.length} pending</Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No weight data available</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Metrics Analysis Tab */}
          <TabsContent value="metrics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Metric Significance Analysis</CardTitle>
                <CardDescription>
                  Statistical analysis of each metric's predictive power for game outcomes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {regressionLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : regressionResults?.metricAnalysis ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead>R² Value</TableHead>
                        <TableHead>P-Value</TableHead>
                        <TableHead>Coefficient</TableHead>
                        <TableHead>Current Weight</TableHead>
                        <TableHead>Predictive Power</TableHead>
                        <TableHead>Significant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {regressionResults.metricAnalysis.map((metric) => (
                        <TableRow key={metric.metric}>
                          <TableCell className="font-medium">{metric.metric}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={metric.rSquared * 100} className="w-16 h-2" />
                              <span className="text-sm">{(metric.rSquared * 100).toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{metric.pValue.toFixed(4)}</TableCell>
                          <TableCell className="text-sm">{metric.coefficient.toFixed(3)}</TableCell>
                          <TableCell className="text-sm">{(metric.weight * 100).toFixed(1)}%</TableCell>
                          <TableCell>
                            <Badge variant={
                              metric.predictivePower === 'High' ? 'default' : 
                              metric.predictivePower === 'Medium' ? 'secondary' : 'outline'
                            }>
                              {metric.predictivePower}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {metric.isStatisticallySignificant ? (
                              <Badge variant="default">Yes</Badge>
                            ) : (
                              <Badge variant="destructive">No</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">No regression analysis data available</p>
                    <Button onClick={handleRunRegression} disabled={isProcessing}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Run Regression Analysis
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Weight Management Tab */}
          <TabsContent value="weights" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Prediction Weights</span>
                  <div className="flex gap-2">
                    {isEditMode ? (
                      <>
                        <Button onClick={handleSaveWeights} disabled={isProcessing} size="sm">
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </Button>
                        <Button onClick={handleCancelEdit} variant="outline" size="sm">
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => setIsEditMode(true)} variant="outline" size="sm">
                        Edit Weights
                      </Button>
                    )}
                  </div>
                </CardTitle>
                <CardDescription>
                  Manage the relative importance of different statistics in predictions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {weightsLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : weightsData ? (
                  <div className="space-y-6">
                    {/* Current vs Recommended Weights */}
                    <div className="grid gap-4">
                      {Object.entries(weightsData.currentWeights).map(([metric, currentWeight]) => {
                        const recommendedWeight = weightsData.regressionAnalysis?.recommendedWeights[metric];
                        const editingWeight = editingWeights[metric] || currentWeight;
                        
                        return (
                          <div key={metric} className="flex items-center gap-4 p-4 border rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <Label className="font-medium">{metric}</Label>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  Current: {(currentWeight * 100).toFixed(1)}%
                                  {recommendedWeight && (
                                    <>
                                      <span>→</span>
                                      <span className="font-medium">Recommended: {(recommendedWeight * 100).toFixed(1)}%</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              
                              {isEditMode ? (
                                <div className="flex items-center gap-4">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={(editingWeight * 100).toFixed(1)}
                                    onChange={(e) => handleWeightChange(metric, parseFloat(e.target.value) / 100)}
                                    className="w-20"
                                  />
                                  <Progress value={editingWeight * 100} className="flex-1" />
                                </div>
                              ) : (
                                <Progress value={currentWeight * 100} className="w-full" />
                              )}
                            </div>
                            
                            {recommendedWeight && (
                              <div className="flex items-center">
                                {recommendedWeight > currentWeight ? (
                                  <TrendingUp className="h-4 w-4 text-green-600" />
                                ) : recommendedWeight < currentWeight ? (
                                  <TrendingDown className="h-4 w-4 text-red-600" />
                                ) : (
                                  <Minus className="h-4 w-4 text-gray-400" />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Recommendations */}
                    {weightsData.recommendations && weightsData.recommendations.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Recommendations</h3>
                        <div className="space-y-2">
                          {weightsData.recommendations.map((rec, index) => (
                            <Alert key={index}>
                              <AlertDescription>
                                <div className="flex items-center justify-between">
                                  <span>
                                    <strong>{rec.metric}:</strong> {rec.reason}
                                  </span>
                                  <Badge variant={rec.priority === 'High' ? 'destructive' : rec.priority === 'Medium' ? 'default' : 'secondary'}>
                                    {rec.priority} Priority
                                  </Badge>
                                </div>
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">No weight data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Weight Change History
                </CardTitle>
                <CardDescription>
                  Track changes to prediction weights over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {weightsLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : weightsData?.weightHistory && weightsData.weightHistory.length > 0 ? (
                  <div className="space-y-4">
                    {weightsData.weightHistory.map((entry) => (
                      <div key={entry.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-medium">{entry.reason}</div>
                            <div className="text-sm text-gray-600">
                              {new Date(entry.timestamp).toLocaleString()}
                            </div>
                          </div>
                          {entry.regressionMetrics && (
                            <Badge variant="outline">
                              R² = {(entry.regressionMetrics.rSquared * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                        
                        {entry.weightChanges && entry.weightChanges.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-700">Weight Changes:</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {entry.weightChanges.map((change) => (
                                <div key={change.metric} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                                  <span>{change.metric}:</span>
                                  <span className="flex items-center gap-1">
                                    {(change.oldWeight * 100).toFixed(1)}% → {(change.newWeight * 100).toFixed(1)}%
                                    {change.change > 0 ? (
                                      <TrendingUp className="h-3 w-3 text-green-600" />
                                    ) : change.change < 0 ? (
                                      <TrendingDown className="h-3 w-3 text-red-600" />
                                    ) : (
                                      <Minus className="h-3 w-3 text-gray-400" />
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No weight change history available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminStatisticsPage;