-- Migration: Add tables for regression analysis and weight management
-- Requirements: 5.1, 6.1, 6.5 - Store regression analysis results and weight history

-- Table for storing regression analysis results
CREATE TABLE regression_analysis_results (
  id SERIAL PRIMARY KEY,
  season INTEGER NOT NULL,
  analysis_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Overall model metrics
  overall_r_squared DECIMAL(5, 4),
  sample_size INTEGER NOT NULL,
  predictive_accuracy DECIMAL(5, 4),
  
  -- Model validation metrics
  residual_standard_error DECIMAL(8, 4),
  f_statistic DECIMAL(8, 4),
  f_p_value DECIMAL(8, 6),
  adjusted_r_squared DECIMAL(5, 4),
  
  -- Analysis metadata
  analysis_duration_ms INTEGER,
  significant_metrics_count INTEGER,
  warnings TEXT[], -- Array of warning messages
  recommendations TEXT[], -- Array of recommendations
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table for storing individual metric regression results
CREATE TABLE regression_metric_results (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES regression_analysis_results(id) ON DELETE CASCADE,
  
  -- Metric identification
  metric_name VARCHAR(50) NOT NULL,
  
  -- Regression coefficients and statistics
  coefficient DECIMAL(8, 4) NOT NULL,
  r_squared DECIMAL(5, 4) NOT NULL,
  p_value DECIMAL(8, 6) NOT NULL,
  confidence_interval_lower DECIMAL(8, 4),
  confidence_interval_upper DECIMAL(8, 4),
  
  -- Calculated weight and significance
  calculated_weight DECIMAL(5, 4) NOT NULL,
  is_statistically_significant BOOLEAN NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table for storing weight history and changes
CREATE TABLE prediction_weight_history (
  id SERIAL PRIMARY KEY,
  season INTEGER NOT NULL,
  change_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Weight values
  passing_offense DECIMAL(5, 4) NOT NULL,
  rushing_offense DECIMAL(5, 4) NOT NULL,
  scoring_efficiency DECIMAL(5, 4) NOT NULL,
  passing_defense DECIMAL(5, 4) NOT NULL,
  rushing_defense DECIMAL(5, 4) NOT NULL,
  turnover_margin DECIMAL(5, 4) NOT NULL,
  special_teams DECIMAL(5, 4) NOT NULL,
  home_field_advantage DECIMAL(5, 4) NOT NULL,
  
  -- Change metadata
  change_reason VARCHAR(100) NOT NULL, -- 'regression_analysis', 'manual_override', 'initialization'
  analysis_id INTEGER REFERENCES regression_analysis_results(id),
  changed_by_user_id UUID REFERENCES users(id),
  
  -- Previous weights for comparison
  previous_weights JSONB,
  
  -- Regression metrics that drove the change
  regression_r_squared DECIMAL(5, 4),
  regression_sample_size INTEGER,
  significant_metrics TEXT[], -- Array of significant metric names
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_regression_analysis_season ON regression_analysis_results(season);
CREATE INDEX idx_regression_analysis_date ON regression_analysis_results(analysis_date);
CREATE INDEX idx_regression_metric_analysis ON regression_metric_results(analysis_id);
CREATE INDEX idx_regression_metric_name ON regression_metric_results(metric_name);
CREATE INDEX idx_weight_history_season ON prediction_weight_history(season);
CREATE INDEX idx_weight_history_date ON prediction_weight_history(change_date);

-- Unique constraint to prevent duplicate current weights per season
CREATE UNIQUE INDEX idx_weight_history_season_latest ON prediction_weight_history(season, change_date DESC);