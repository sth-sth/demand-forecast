import type { ModelCatalogItem } from "./types";

export interface ExternalReference {
  label: string;
  url: string;
}

export interface FormulaParameter {
  symbol: string;
  meaning: string;
  businessValueGuide: string;
}

export interface PythonWorkflowStep {
  step: string;
  detail: string;
}

export interface ModelKnowledge {
  overview: string;
  logic: string[];
  functionPackages: string[];
  formula: string[];
  updateEquations: string[];
  formulaParameters: FormulaParameter[];
  mathWorkflow: string[];
  manualCalculationSteps: string[];
  example: string[];
  pythonWorkflow: PythonWorkflowStep[];
  pythonReferenceCode: string;
  excelWorkflow: string[];
  reproducibilityChecklist: string[];
  paramNotes: Record<string, string>;
  tips: string[];
  links: ExternalReference[];
}

type FamilyKnowledgeTemplate = {
  overview: string;
  logic: string[];
  formula: string[];
  example: string[];
  tips: string[];
  links: ExternalReference[];
};

const COMMON_PARAM_NOTES: Record<string, string> = {
  season_length: "季节长度。日频常见 7，月频常见 12；用于刻画周期性重复模式。",
  window: "滑动窗口长度。窗口越大越平滑，越小越敏感。",
  order: "ARIMA 非季节项阶数 (p,d,q)：自回归、差分、移动平均。",
  seasonal_order: "季节项阶数 (P,D,Q,m)：用于处理周/月等季节性波动。",
  alpha: "正则化强度。值越大约束越强，过拟合风险越低但可能欠拟合。",
  l1_ratio: "ElasticNet 中 L1 与 L2 的配比，越接近 1 越偏向稀疏特征选择。",
  n_estimators: "树模型中的基学习器数量。一般越大越稳，但训练更慢。",
  max_depth: "树深度上限。越深越能拟合复杂关系，也更容易过拟合。",
  min_samples_leaf: "叶子节点最小样本数。提高该值可降低噪声敏感度。",
  learning_rate: "每轮迭代的步长。较小学习率通常需要更多迭代但更稳健。",
  subsample: "每轮训练的样本采样比例，用于降低方差、提升泛化。",
  colsample_bytree: "每棵树使用的特征采样比例，控制特征随机性。",
  num_leaves: "LightGBM 叶子数量上限，决定树结构复杂度。",
  feature_fraction: "LightGBM 的特征采样比例。",
  bagging_fraction: "LightGBM 的样本采样比例。",
  depth: "CatBoost 树深度。",
  iterations: "CatBoost 迭代次数。",
  max_steps: "深度时序模型训练步数上限。",
  p: "AR 阶数候选。",
  d: "差分阶数候选。",
  q: "MA 阶数候选。",
  P: "季节 AR 阶数候选。",
  D: "季节差分阶数候选。",
  Q: "季节 MA 阶数候选。",
  m: "季节周期长度候选。",
  weekly_seasonality: "是否启用周季节性。",
  yearly_seasonality: "是否启用年季节性。",
  changepoint_prior_scale: "趋势变化点灵活度，越大越容易拟合结构变化。",
  damped_trend: "是否阻尼趋势。开启后趋势随预测步长递减，适合避免远期过冲。",
  phi: "趋势阻尼系数（0<phi<=1），越小表示远期趋势衰减越快。",
  trend: "趋势项形式（add/mul/None），决定趋势与水平的组合方式。",
  seasonal: "季节项形式（add/mul/None），决定季节对预测值的影响方式。",
};

const FAMILY_DEFAULT: Record<string, FamilyKnowledgeTemplate> = {
  baseline: {
    overview: "基线模型用于建立业务对照组，建议先看它们再评估复杂模型是否带来真实增益。",
    logic: [
      "基于历史序列的简单规则生成未来值，训练成本极低。",
      "对数据质量要求低，适合快速冒烟验证与上线前基准测试。",
      "若复杂模型显著优于基线，说明特征与模型确实提供了增量价值。",
    ],
    formula: [
      "$$\\hat{y}_{t+h}=f(y_1,\\ldots,y_t)$$",
      "$$\\text{Baseline 通常只使用历史 } y_t \\text{，不引入外生特征}$$",
    ],
    example: [
      "例：最近销量 [100, 110, 120]，若采用最后值规则，则未来每期预测约为 120。",
      "可先把基线结果当对照，再判断复杂模型是否值得上线。",
    ],
    tips: [
      "上线前至少保留一个基线模型作为监控对照。",
      "在数据量很小或波动非常稳定时，基线可能已经足够。",
    ],
    links: [{ label: "Forecasting Principles and Practice: Simple methods", url: "https://otexts.com/fpp3/simple-methods.html" }],
  },
  statistical: {
    overview: "统计模型依赖序列本身结构，擅长趋势和季节性分解，解释性较强。",
    logic: [
      "先识别趋势、季节项与随机项，再按模型假设进行参数估计。",
      "不依赖大量特征工程，适合规则明显的时间序列。",
      "通常可作为业务报表和策略讨论时的可解释基线。",
    ],
    formula: [
      "$$y_t=trend_t+season_t+error_t$$",
      "$$\\min_{\\theta}\\sum_t(y_t-\\hat{y}_t)^2,\\;error_t\\approx white\\ noise$$",
    ],
    example: [
      "例：门店周季节明显（周末高、工作日低），统计模型会显式学习这类重复模式。",
      "若最近出现稳定上升趋势，模型会把趋势项和季节项叠加给出未来值。",
    ],
    tips: [
      "当节假日、价格等外因影响明显时，可考虑引入外生变量模型。",
      "强烈建议对季节长度进行业务校验。",
    ],
    links: [{ label: "Forecasting Principles and Practice: ARIMA/ETS", url: "https://otexts.com/fpp3/" }],
  },
  intermittent: {
    overview: "间歇需求模型用于长尾 SKU 或低频补货场景，重点解决大量零值和突发需求。",
    logic: [
      "将需求发生概率与需求发生时的规模拆开建模。",
      "通过聚合或平滑减少稀疏噪声，提升补货稳定性。",
      "更关注缺货风险与库存周转平衡，而非单点数值拟合。",
    ],
    formula: [
      "$$\\hat{y}=p_{nonzero}\\times size_{nonzero}$$",
      "$$p_{nonzero}=P(y_t>0),\\quad size_{nonzero}=E(y_t\\mid y_t>0)$$",
    ],
    example: [
      "例：某 SKU 10 天里仅 2 天有销量，模型会分别估计发生概率和非零销量均值。",
      "最终预测可用于补货阈值，而不是只看单日点预测。",
    ],
    tips: [
      "建议与服务水平约束和安全库存策略联合使用。",
      "评估时优先关注 WAPE/MAE 与缺货率指标。",
    ],
    links: [{ label: "Intermittent demand forecasting overview", url: "https://openforecast.org/tag/intermittent-demand/" }],
  },
  ml: {
    overview: "机器学习模型通过滞后特征与日历特征学习非线性关系，适合多因素驱动场景。",
    logic: [
      "构造 lag、rolling、calendar 等特征后做监督学习。",
      "支持自动调参，可在准确率与训练耗时间折中。",
      "对数据量和特征质量更敏感，建议持续做特征迭代。",
    ],
    formula: [
      "$$\\hat{y}=f_\\theta(x),\\;x=[lag,rolling,calendar]$$",
      "$$\\theta^*=\\arg\\min_\\theta\\mathcal{L}(y,f_\\theta(x))$$",
    ],
    example: [
      "例：输入特征包含 lag_1=120, lag_7=98, is_promo=1，模型输出次日预测 135。",
      "可通过增加节假日、价格等特征提升拟合能力。",
    ],
    tips: [
      "优先保证训练集覆盖完整业务周期。",
      "树模型常见表现稳定，线性模型更利于解释。",
    ],
    links: [{ label: "scikit-learn user guide", url: "https://scikit-learn.org/stable/user_guide.html" }],
  },
  deep: {
    overview: "深度时序模型擅长捕获长依赖和复杂模式，通常在大规模数据上优势更明显。",
    logic: [
      "通过神经网络端到端学习时间依赖结构。",
      "对超参数和训练资源较敏感，需要更规范的实验管理。",
      "在多序列、复杂季节性场景可获得更高上限。",
    ],
    formula: [
      "$$\\hat{y}_{t+1:t+h}=NN_\\theta(x_{1:t})$$",
      "$$\\theta\\leftarrow\\theta-\\eta\\nabla_\\theta\\mathcal{L}(y,\\hat{y})$$",
    ],
    example: [
      "例：输入过去 56 天序列，网络一次性输出未来 14 天预测。",
      "当商品数很多且模式复杂时，深度模型通常比单序列统计模型更有上限。",
    ],
    tips: [
      "建议先用统计/ML 模型建立稳定基线，再引入深度模型。",
      "注意训练步数、输入窗口与硬件资源匹配。",
    ],
    links: [{ label: "NeuralForecast documentation", url: "https://nixtlaverse.nixtla.io/neuralforecast/" }],
  },
  ensemble: {
    overview: "集成模型通过组合多个基模型降低方差，通常能提升整体鲁棒性。",
    logic: [
      "先训练多个候选模型，再按规则做均值或加权融合。",
      "当单模型在不同序列上各有优劣时，集成往往更稳。",
      "可通过业务偏好设置权重策略。",
    ],
    formula: [
      "$$\\hat{y}=\\sum_{i=1}^{N}w_i\\hat{y}_i,\\;\\sum_i w_i=1$$",
      "$$w_i=1/N\\;\\text{时为等权平均}$$",
    ],
    example: [
      "例：ARIMA=120, LightGBM=128, Prophet=124，等权集成为 124。",
      "若按历史误差加权，误差更小的模型权重更高。",
    ],
    tips: [
      "关注不同基模型误差相关性，相关性低时集成收益更高。",
      "加权集成建议定期重估权重。",
    ],
    links: [{ label: "Forecast combinations", url: "https://otexts.com/fpp3/combinations.html" }],
  },
  hierarchical: {
    overview: "层级模型用于商品-品类-区域等多层组织结构，确保上下层预测一致。",
    logic: [
      "先在叶子层或总层预测，再通过一致性约束进行重分配。",
      "可兼顾总部计划与门店执行的一致口径。",
      "适合 S&OP、补货协同等多层级管理场景。",
    ],
    formula: [
      "$$\\hat{y}_{reconciled}=S\\,g(\\hat{y}_{base})$$",
      "$$\\text{并满足层级聚合一致性约束}$$",
    ],
    example: [
      "例：总量预测 1000，若 A/B 历史占比 60/40，则可分配为 600/400。",
      "重分配后再汇总回总层，结果应严格等于 1000。",
    ],
    tips: [
      "建议先明确层级维度与汇总规则。",
      "关注不同层级误差权重，避免重分配偏差。",
    ],
    links: [{ label: "Hierarchical forecasting", url: "https://otexts.com/fpp3/hierarchical.html" }],
  },
  inventory: {
    overview: "库存业务模型关注有货概率与期望需求，直接服务补货和缺货风险控制。",
    logic: [
      "将需求拆解为是否有货和有货时销量两个问题。",
      "输出可直接用于安全库存与补货阈值策略。",
      "对促销、缺货、节假日等业务变量较敏感。",
    ],
    formula: [
      "$$ExpectedDemand=P(in\\_stock\\mid x)\\times AvgNonZeroDemand$$",
      "$$\\text{该期望值可直接用于补货与安全库存计算}$$",
    ],
    example: [
      "例：若 P(in_stock)=0.8，历史非零均值=50，则期望需求约 40。",
      "可配合服务水平目标决定是否提前补货。",
    ],
    tips: [
      "建议将概率输出接入库存策略而非单独使用。",
      "可结合服务水平目标做阈值分层。",
    ],
    links: [{ label: "RandomForestClassifier documentation", url: "https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html" }],
  },
};

const FAMILY_FORMULA_PARAMETERS: Record<string, FormulaParameter[]> = {
  baseline: [
    {
      symbol: "y_t",
      meaning: "当前时点的实际需求",
      businessValueGuide: "取最近一期已确认销量，确保已经扣除退货和异常单。",
    },
    {
      symbol: "h",
      meaning: "预测步长",
      businessValueGuide: "按业务决策周期设置，例如日频补货常用 7/14/30。",
    },
    {
      symbol: "y_hat(t+h)",
      meaning: "未来第 h 期预测需求",
      businessValueGuide: "直接用于补货计划或销售目标分解。",
    },
  ],
  statistical: [
    {
      symbol: "trend_t",
      meaning: "趋势项",
      businessValueGuide: "反映长期上升/下降，适合观察新品爬坡和生命周期变化。",
    },
    {
      symbol: "season_t",
      meaning: "季节项",
      businessValueGuide: "由 season_length 决定周期，日频常见 7，月频常见 12。",
    },
    {
      symbol: "error_t",
      meaning: "随机误差项",
      businessValueGuide: "误差越接近白噪声，说明模型结构越合理。",
    },
  ],
  intermittent: [
    {
      symbol: "p_non_zero",
      meaning: "需求发生概率",
      businessValueGuide: "统计历史中非零销量出现频率，可按 SKU/门店分层估计。",
    },
    {
      symbol: "size_non_zero",
      meaning: "发生需求时的平均规模",
      businessValueGuide: "只在 y>0 样本上求均值，避免被大量零值稀释。",
    },
    {
      symbol: "y_hat",
      meaning: "期望需求",
      businessValueGuide: "可直接映射安全库存与补货下限。",
    },
  ],
  ml: [
    {
      symbol: "x",
      meaning: "特征向量（lag/rolling/calendar）",
      businessValueGuide: "至少覆盖一个完整业务周期，避免节律信息缺失。",
    },
    {
      symbol: "theta",
      meaning: "模型参数",
      businessValueGuide: "通过训练得到，不同模型由 tune_trials 自动搜索。",
    },
    {
      symbol: "y_hat",
      meaning: "预测需求",
      businessValueGuide: "用于订单建议时建议和基线模型同步对照。",
    },
  ],
  deep: [
    {
      symbol: "x_{1:t}",
      meaning: "历史序列窗口",
      businessValueGuide: "窗口长度建议至少覆盖 2 个季节周期。",
    },
    {
      symbol: "NN_theta",
      meaning: "神经网络映射函数",
      businessValueGuide: "通过最小化损失函数学习参数 theta，需固定随机种子复现。",
    },
    {
      symbol: "y_hat_{t+1:t+h}",
      meaning: "未来多步预测",
      businessValueGuide: "适用于中长期滚动计划和促销备货。",
    },
  ],
  ensemble: [
    {
      symbol: "y_hat_i",
      meaning: "第 i 个基模型预测",
      businessValueGuide: "建议至少选 2 个相关性较低的基模型。",
    },
    {
      symbol: "w_i",
      meaning: "第 i 个模型权重",
      businessValueGuide: "可按历史误差反比设定，且满足总和为 1。",
    },
    {
      symbol: "y_hat",
      meaning: "集成后预测",
      businessValueGuide: "用于线上发布时通常比单模型更稳健。",
    },
  ],
  hierarchical: [
    {
      symbol: "S",
      meaning: "层级求和矩阵",
      businessValueGuide: "由商品-品类-大区等组织结构定义。",
    },
    {
      symbol: "y_hat_base",
      meaning: "基础预测向量",
      businessValueGuide: "可来自底层模型或总层模型。",
    },
    {
      symbol: "y_hat_reconciled",
      meaning: "一致化预测",
      businessValueGuide: "保证门店汇总后与总部总量一致。",
    },
  ],
  inventory: [
    {
      symbol: "P(in_stock|x)",
      meaning: "未来有货概率",
      businessValueGuide: "可用最近 30-90 天样本滚动更新，反映缺货风险。",
    },
    {
      symbol: "AvgNonZeroDemand",
      meaning: "非零需求均值",
      businessValueGuide: "在 y>0 样本上计算，作为需求规模基准。",
    },
    {
      symbol: "ExpectedDemand",
      meaning: "期望需求",
      businessValueGuide: "可直接作为补货建议量的输入。",
    },
  ],
};

const FAMILY_PYTHON_WORKFLOW: Record<string, PythonWorkflowStep[]> = {
  baseline: [
    { step: "步骤1：读取数据", detail: "用 pandas 读取 CSV，并保留 ds、y、unique_id 三列。" },
    { step: "步骤2：时间切分", detail: "按时间升序，最后 horizon 作为验证集。" },
    { step: "步骤3：按公式计算", detail: "例如 Naive 直接使用最后一个观测值外推。" },
    { step: "步骤4：评估误差", detail: "计算 MAE/WAPE/sMAPE，和基线或历史方案对比。" },
    { step: "步骤5：业务发布", detail: "达标后输出补货建议并记录参数与指标。" },
  ],
  statistical: [
    { step: "步骤1：校验季节周期", detail: "根据业务频率设置 season_length，例如日频 7。" },
    { step: "步骤2：拟合统计模型", detail: "使用 statsforecast 或 statsmodels 训练 ARIMA/ETS。" },
    { step: "步骤3：生成多步预测", detail: "输出 horizon 期预测值并对齐日期。" },
    { step: "步骤4：计算统一指标", detail: "按 MAE/RMSE/MAPE/sMAPE/WAPE/MASE 评估。" },
    { step: "步骤5：形成业务结论", detail: "解释趋势项、季节项，并给出库存或产销建议。" },
  ],
  intermittent: [
    { step: "步骤1：识别稀疏序列", detail: "统计零值占比，筛选长尾或低频 SKU。" },
    { step: "步骤2：分解概率与规模", detail: "分别估计需求发生概率和非零需求规模。" },
    { step: "步骤3：计算期望需求", detail: "按 y_hat = p_non_zero * size_non_zero 生成预测。" },
    { step: "步骤4：评估缺货风险", detail: "除误差指标外，增加缺货率和服务水平观察。" },
    { step: "步骤5：补货落地", detail: "把期望需求接入安全库存和订货点策略。" },
  ],
  ml: [
    { step: "步骤1：构造特征", detail: "生成 lag、rolling、日历特征，避免未来信息泄漏。" },
    { step: "步骤2：训练模型", detail: "训练线性或树模型，并固定 random_state=42。" },
    { step: "步骤3：自动调参", detail: "设置 tune_trials，按验证集指标选择最优参数。" },
    { step: "步骤4：回测复核", detail: "在最后 horizon 上输出 y 与 y_pred 对照。" },
    { step: "步骤5：上线监控", detail: "上线后持续监控 WAPE 和异常波动。" },
  ],
  deep: [
    { step: "步骤1：准备多序列数据", detail: "统一 ds/y/unique_id，并处理缺失和异常。" },
    { step: "步骤2：设置训练窗口", detail: "配置 input_size、horizon、max_steps。" },
    { step: "步骤3：训练神经网络", detail: "固定随机种子，记录每次实验参数。" },
    { step: "步骤4：输出预测区间", detail: "除点预测外，建议同时输出置信区间。" },
    { step: "步骤5：业务验收", detail: "与统计/ML 基线比较后再决定是否替换。" },
  ],
  ensemble: [
    { step: "步骤1：训练多个基模型", detail: "至少选择两个不同家族模型。" },
    { step: "步骤2：计算组合权重", detail: "可用等权或按历史误差反比加权。" },
    { step: "步骤3：合成预测", detail: "按 y_hat = sum(w_i * y_hat_i) 输出集成结果。" },
    { step: "步骤4：评估稳定性", detail: "重点对比波动期表现和极端误差。" },
    { step: "步骤5：定期重估", detail: "每月或每季度重算权重，避免老化。" },
  ],
  hierarchical: [
    { step: "步骤1：定义层级结构", detail: "明确 SKU-品类-区域等汇总关系并构建 S。" },
    { step: "步骤2：生成基础预测", detail: "可先做底层预测，也可先做总层预测。" },
    { step: "步骤3：一致化重分配", detail: "使用 BottomUp/TopDown/MinT 进行对齐。" },
    { step: "步骤4：核对一致性", detail: "验证底层汇总后严格等于总层预测。" },
    { step: "步骤5：下发执行", detail: "将一致化结果同步到总部计划和门店补货。" },
  ],
  inventory: [
    { step: "步骤1：定义有货标签", detail: "将 y>0 转换为 is_in_stock 二分类标签。" },
    { step: "步骤2：训练概率模型", detail: "用分类器输出 P(in_stock|x)。" },
    { step: "步骤3：映射期望需求", detail: "ExpectedDemand = P(in_stock|x) * AvgNonZeroDemand。" },
    { step: "步骤4：制定库存动作", detail: "按服务水平目标设置补货阈值。" },
    { step: "步骤5：复盘迭代", detail: "按周复盘缺货率与滞销率，调整阈值。" },
  ],
};

const FAMILY_FUNCTION_PACKAGES: Record<string, string[]> = {
  baseline: [
    "`statsforecast.models.Naive`",
    "`statsforecast.models.SeasonalNaive`",
    "`statsforecast.models.RandomWalkWithDrift`",
  ],
  statistical: [
    "`statsforecast.models.AutoETS`",
    "`statsmodels.tsa.holtwinters.ExponentialSmoothing`",
    "`statsforecast.models.AutoARIMA`",
    "`prophet.Prophet`",
  ],
  intermittent: [
    "`statsforecast.models.CrostonClassic`",
    "`statsforecast.models.CrostonSBA`",
    "`statsforecast.models.TSB`",
  ],
  ml: [
    "`sklearn.linear_model.LinearRegression/Ridge/Lasso/ElasticNet`",
    "`sklearn.ensemble.RandomForestRegressor`",
    "`xgboost.XGBRegressor`",
    "`lightgbm.LGBMRegressor`",
    "`catboost.CatBoostRegressor`",
  ],
  deep: [
    "`neuralforecast.NeuralForecast`",
    "`neuralforecast.models.LSTM/NBEATS/NHITS/TFT/PatchTST/Informer/DeepAR/TimesNet`",
  ],
  ensemble: [
    "`sklearn.ensemble.VotingRegressor`",
    "`numpy.average`（按权重加权）",
  ],
  hierarchical: [
    "`hierarchicalforecast.core.HierarchicalReconciliation`",
    "`hierarchicalforecast.methods.BottomUp/TopDown/MinTrace`",
  ],
  inventory: [
    "`sklearn.ensemble.RandomForestClassifier`",
  ],
};

const FAMILY_UPDATE_EQUATIONS: Record<string, string[]> = {
  baseline: [
    "$\\hat{y}_{t+h}=y_t$（Naive）",
    "$\\hat{y}_{t+h}=y_{t+h-mk}$（SeasonalNaive）",
    "$\\hat{y}_{t+h}=y_t+h\\cdot\\frac{y_t-y_1}{t-1}$（Drift）",
  ],
  statistical: [
    "一、加法季节 ETS(A,A,A)：",
    "$\\ell_t=\\alpha(y_t-s_{t-m})+(1-\\alpha)(\\ell_{t-1}+b_{t-1})$",
    "$b_t=\\beta(\\ell_t-\\ell_{t-1})+(1-\\beta)b_{t-1}$",
    "$s_t=\\gamma(y_t-\\ell_t)+(1-\\gamma)s_{t-m}$",
    "$\\hat{y}_{t+h}=\\ell_t+h\\cdot b_t+s_{t+h-m(k+1)}$",
    "二、乘法季节 ETS(A,A,M)：",
    "$\\ell_t=\\alpha\\left(\\frac{y_t}{s_{t-m}}\\right)+(1-\\alpha)(\\ell_{t-1}+b_{t-1})$",
    "$b_t=\\beta(\\ell_t-\\ell_{t-1})+(1-\\beta)b_{t-1}$",
    "$s_t=\\gamma\\left(\\frac{y_t}{\\ell_t}\\right)+(1-\\gamma)s_{t-m}$",
    "$\\hat{y}_{t+h}=(\\ell_t+h\\cdot b_t)\\cdot s_{t+h-m(k+1)}$",
    "三、阻尼趋势（可选）：",
    "$\\hat{y}^{add}_{t+h}=\\ell_t+b_t\\sum_{j=1}^{h}\\phi^j+s_{t+h-m(k+1)}$",
    "$\\hat{y}^{mul}_{t+h}=\\left(\\ell_t+b_t\\sum_{j=1}^{h}\\phi^j\\right)\\cdot s_{t+h-m(k+1)}$",
  ],
  intermittent: [
    "$\\hat{z}_t=\\alpha z_t+(1-\\alpha)\\hat{z}_{t-1}$",
    "$\\hat{p}_t=\\alpha p_t+(1-\\alpha)\\hat{p}_{t-1}$",
    "$\\hat{y}=\\hat{z}_t/\\hat{p}_t$ 或 $\\hat{y}=p_{nonzero}\\times size_{nonzero}$",
  ],
  ml: [
    "$\\hat{y}=f_\\theta(x)$",
    "$\\theta^*=\\arg\\min_\\theta\\mathcal{L}(y,f_\\theta(x))$",
  ],
  deep: [
    "$\\hat{y}_{t+1:t+h}=NN_\\theta(x_{1:t})$",
    "$\\theta\\leftarrow\\theta-\\eta\\nabla_\\theta\\mathcal{L}(y,\\hat{y})$",
  ],
  ensemble: [
    "$\\hat{y}=\\sum_i w_i\\hat{y}_i,\\;\\sum_i w_i=1$",
    "$w_i\\propto1/error_i$（按误差反比分配）",
  ],
  hierarchical: [
    "$\\hat{y}_{rec}=S\\,g(\\hat{y}_{base})$",
    "约束：底层聚合后严格等于上层预测值。",
  ],
  inventory: [
    "$P(in\\_stock|x)=\\frac{1}{B}\\sum_b I(T_b(x)=1)$",
    "$ExpectedDemand=P(in\\_stock|x)\\times AvgNonZeroDemand$",
  ],
};

const MODEL_FUNCTION_PACKAGES: Record<string, string[]> = {
  AutoETS: [
    "`statsforecast.models.AutoETS`（自动搜索 ETS 结构）",
    "`statsmodels.tsa.holtwinters.ExponentialSmoothing`（显式指定 add/mul）",
  ],
  AutoARIMA: [
    "`statsforecast.models.AutoARIMA`",
    "`statsmodels.tsa.arima.model.ARIMA`",
  ],
  Prophet: [
    "`prophet.Prophet`",
  ],
  InStockClassifier: [
    "`sklearn.ensemble.RandomForestClassifier`",
  ],
};

const MODEL_UPDATE_EQUATIONS: Record<string, string[]> = {
  AutoETS: [
    "一、加法季节 ETS(A,A,A) 更新链：",
    "$\\ell_t=\\alpha(y_t-s_{t-m})+(1-\\alpha)(\\ell_{t-1}+b_{t-1})$",
    "$b_t=\\beta(\\ell_t-\\ell_{t-1})+(1-\\beta)b_{t-1}$",
    "$s_t=\\gamma(y_t-\\ell_t)+(1-\\gamma)s_{t-m}$",
    "$\\hat{y}_{t+h}=\\ell_t+h\\cdot b_t+s_{t+h-m(k+1)}$",
    "二、乘法季节 ETS(A,A,M) 更新链：",
    "$\\ell_t=\\alpha\\left(\\frac{y_t}{s_{t-m}}\\right)+(1-\\alpha)(\\ell_{t-1}+b_{t-1})$",
    "$b_t=\\beta(\\ell_t-\\ell_{t-1})+(1-\\beta)b_{t-1}$",
    "$s_t=\\gamma\\left(\\frac{y_t}{\\ell_t}\\right)+(1-\\gamma)s_{t-m}$",
    "$\\hat{y}_{t+h}=(\\ell_t+h\\cdot b_t)\\cdot s_{t+h-m(k+1)}$",
    "三、阻尼趋势（$0<\\phi\\le1$）：",
    "$\\hat{y}^{add}_{t+h}=\\ell_t+b_t\\sum_{j=1}^{h}\\phi^j+s_{t+h-m(k+1)}$",
    "$\\hat{y}^{mul}_{t+h}=\\left(\\ell_t+b_t\\sum_{j=1}^{h}\\phi^j\\right)\\cdot s_{t+h-m(k+1)}$",
  ],
  AutoARIMA: [
    "差分后 ARMA 结构：$(1-\\phi(L))(1-L)^dy_t=c+(1+\\theta(L))\\varepsilon_t$",
    "多步预测由 AR/MA 递推生成，季节项通过 $(1-L^m)^D$ 建模。",
  ],
  Prophet: [
    "$y(t)=g(t)+s(t)+h(t)+\\varepsilon_t$",
    "趋势项 $g(t)$ 在 changepoints 处按分段线性/逻辑增长更新。",
  ],
  InStockClassifier: [
    "$P(in\\_stock|x)=\\frac{1}{B}\\sum_b I(T_b(x)=1)$",
    "$ExpectedDemand=P(in\\_stock|x)\\times AvgNonZeroDemand$",
  ],
};

const FAMILY_MATH_WORKFLOW: Record<string, string[]> = {
  baseline: [
    "定义历史序列 $y_1,\dots,y_t$ 与预测步长 $h$。",
    "Naive: 令 $\\hat{y}_{t+h}=y_t$，本质是零增量假设。",
    "SeasonalNaive: 令 $\\hat{y}_{t+h}=y_{t+h-mk}$，其中 $m$ 为季节长度。",
    "Drift: 先计算斜率 $s=(y_t-y_1)/(t-1)$，再令 $\\hat{y}_{t+h}=y_t+h\\cdot s$。",
  ],
  statistical: [
    "把序列分解为 $y_t=trend_t+season_t+error_t$。",
    "通过极大似然或最小二乘估计参数，最小化残差项。",
    "检查残差是否接近白噪声，若否说明模型假设不足。",
    "按估计参数递推未来 $h$ 步得到 $\\hat{y}_{t+1:t+h}$。",
  ],
  intermittent: [
    "把需求拆成发生概率和发生规模两个过程。",
    "估计 $p_{nonzero}=P(y_t>0)$ 与 $size_{nonzero}=E(y_t|y_t>0)$。",
    "用 $\\hat{y}=p_{nonzero}\\times size_{nonzero}$ 得到期望需求。",
    "在库存决策里与服务水平约束联合使用。",
  ],
  ml: [
    "定义监督学习映射 $\\hat{y}=f_\\theta(x)$。",
    "构造滞后特征 $lag_k=y_{t-k}$、滚动特征与日历特征。",
    "通过训练最小化损失 $L(\\theta)=\\sum (y-\\hat{y})^2$ 或 MAE 类目标。",
    "滚动预测时每一步都把上一时点预测回填到特征窗口中。",
  ],
  deep: [
    "构造历史窗口 $x_{1:t}$ 与未来标签 $y_{t+1:t+h}$。",
    "定义网络 $\\hat{y}_{t+1:t+h}=NN_\\theta(x_{1:t})$。",
    "用反向传播最小化损失并更新参数 $\\theta$。",
    "用固定随机种子复现实验，确保结果可追溯。",
  ],
  ensemble: [
    "先得到多个基模型预测 $\\hat{y}_1,\\dots,\\hat{y}_N$。",
    "定义权重 $w_i\\ge0,\\sum_i w_i=1$。",
    "组合预测为 $\\hat{y}=\\sum_i w_i\\hat{y}_i$。",
    "可设 $w_i\\propto 1/error_i$，让低误差模型权重更高。",
  ],
  hierarchical: [
    "定义层级求和矩阵 $S$，建立底层与汇总层关系。",
    "先得到基础预测向量 $\\hat{y}_{base}$。",
    "通过 BottomUp/TopDown/MinT 得到一致化预测 $\\hat{y}_{rec}$。",
    "验证约束：底层聚合后严格等于对应上层预测。",
  ],
  inventory: [
    "建立二分类模型得到有货概率 $P(in\\_stock|x)$。",
    "计算非零需求均值 $AvgNonZeroDemand$。",
    "期望需求：$ExpectedDemand=P(in\\_stock|x)\\times AvgNonZeroDemand$。",
    "把期望需求映射到订货点和安全库存策略。",
  ],
};

const FAMILY_MANUAL_CALCULATION_STEPS: Record<string, string[]> = {
  baseline: [
    "准备样本：最近 7 天销量为 `[118,122,125,131,136,144,138]`。",
    "以 Naive 为例，下一期预测直接取最后值：$\\hat{y}_{t+1}=138$。",
    "若真实下一期为 `130`，则绝对误差为 $|130-138|=8$。",
  ],
  statistical: [
    "取一个周季节序列，设当前状态 $\\ell_t=120,b_t=1.5,s_{t+1-7}=6$。",
    "用 ETS 一步预测：$\\hat{y}_{t+1}=\\ell_t+b_t+s_{t+1-7}=120+1.5+6=127.5$。",
    "若真实值为 `124`，则误差为 $124-127.5=-3.5$，绝对误差 `3.5`。",
  ],
  intermittent: [
    "统计近 30 天：非零天数 `6`，则 $p_{nonzero}=6/30=0.2$。",
    "非零销量均值为 `40`，则 $size_{nonzero}=40$。",
    "期望需求为 $\\hat{y}=p_{nonzero}\\times size_{nonzero}=0.2\\times40=8$。",
  ],
  ml: [
    "构造特征：`lag_1=120, lag_7=98, roll_mean_7=110, dayofweek=2`。",
    "将特征输入模型得到预测，设输出 $\\hat{y}=126.4$。",
    "若真实值 `130`，则误差为 $130-126.4=3.6$，绝对误差 `3.6`。",
  ],
  deep: [
    "取历史窗口长度 `28`，模型输出未来 7 天第一期预测，设 $\\hat{y}_{t+1}=132$。",
    "若真实值为 `128`，则平方误差为 $(128-132)^2=16$。",
    "多期误差可按 RMSE 汇总：$RMSE=\\sqrt{\\frac{1}{n}\\sum (y-\\hat{y})^2}$。",
  ],
  ensemble: [
    "三个基模型预测分别为 `[120,126,123]`。",
    "等权集成：$\\hat{y}=\\frac{120+126+123}{3}=123$。",
    "若加权 `w=[0.5,0.3,0.2]`，则 $\\hat{y}=120\\times0.5+126\\times0.3+123\\times0.2=122.4$。",
  ],
  hierarchical: [
    "底层 SKU 预测为 `A=300,B=500,C=200`。",
    "汇总层预测为 $300+500+200=1000$。",
    "若总部目标总量也是 `1000`，则说明层级一致性满足。",
  ],
  inventory: [
    "模型输出有货概率 $P(in\\_stock|x)=0.73$。",
    "历史非零均值 `AvgNonZeroDemand=42`。",
    "期望需求：$ExpectedDemand=0.73\\times42=30.66$。",
  ],
};

const MODEL_MANUAL_CALCULATION_STEPS: Record<string, string[]> = {
  AutoETS: [
    "以加法 ETS 为例，设上期状态：$\\ell_{t-1}=118,b_{t-1}=1.2,s_{t-7}=5$，平滑参数 $\\alpha=0.3,\\beta=0.1,\\gamma=0.2$。",
    "若本期真实值 $y_t=130$，则新水平 $\\ell_t=0.3\\times(130-5)+0.7\\times(118+1.2)=120.94$。",
    "趋势更新 $b_t=0.1\\times(120.94-118)+0.9\\times1.2=1.374$。",
    "若新季节项近似更新为 $s_t=5.6$，则一步预测 $\\hat{y}_{t+1}=120.94+1.374+5.6=127.914$。",
  ],
  SeasonalNaive: [
    "设季节长度 `m=7`，已知上周周一销量为 `142`。",
    "则下周周一预测：$\\hat{y}_{t+7}=y_t=142$。",
    "若真实值 `137`，绝对误差为 $|137-142|=5$。",
  ],
  Drift: [
    "首日销量 `100`，当前销量 `130`，跨度 `30` 天。",
    "斜率为 $s=(130-100)/(30-1)=1.034$。",
    "预测 3 天后：$\\hat{y}_{t+3}=130+3\\times1.034=133.10$。",
  ],
  MovingAverage: [
    "取窗口 `w=3`，最近三期销量 `[120,132,126]`。",
    "下一期预测：$\\hat{y}_{t+1}=(120+132+126)/3=126$。",
    "若真实值 `129`，误差为 `3`。",
  ],
  InStockClassifier: [
    "100 棵树中有 `73` 棵投票“有货”，则 $P(in\\_stock|x)=73/100=0.73$。",
    "历史非零需求均值为 `42`。",
    "期望需求：$ExpectedDemand=0.73\\times42=30.66$，可直接用于补货测算。",
  ],
  EnsembleWeighted: [
    "三个模型预测 `[120,126,123]`，验证误差 `[10,20,25]`。",
    "反比权重未归一化为 `[0.1,0.05,0.04]`，归一化后约 `[0.526,0.263,0.211]`。",
    "加权预测约为 $120\\times0.526+126\\times0.263+123\\times0.211=122.42$。",
  ],
};

const FAMILY_EXCEL_WORKFLOW: Record<string, string[]> = {
  baseline: [
    "按日期升序放在 A 列，销量放在 B 列。",
    "Naive：C2 起填 `=B1` 并向下拖拽。",
    "MovingAverage(window=7)：C8 起填 `=AVERAGE(B2:B8)` 并向下。",
    "Drift：若首行在 B2，当前行在 Bn，则 `=Bn + h*(Bn-$B$2)/(ROW(Bn)-ROW($B$2))`。",
  ],
  statistical: [
    "用辅助列拆分趋势和季节索引（例如周内索引 1..7）。",
    "趋势可先用线性回归函数 `FORECAST.LINEAR` 估算。",
    "季节项可按同一季节位置历史均值计算。",
    "最终预测 = 趋势预测 + 对应季节项。",
  ],
  intermittent: [
    "新增列 C：`=IF(B2>0,1,0)` 表示是否发生需求。",
    "发生概率：`=AVERAGE(C:C)`。",
    "非零均值：`=AVERAGEIF(B:B,\">0\")`。",
    "期望需求：`=发生概率*非零均值`。",
  ],
  ml: [
    "构造 lag 列：`lag1=B1`、`lag7=B(当前行-7)`。",
    "构造 rolling 均值列：`=AVERAGE(B(当前行-6):B当前行)`。",
    "把特征列导出给 Python 训练；Excel 主要用于特征与结果复核。",
    "用数据透视表检查不同门店/SKU误差分布。",
  ],
  deep: [
    "Excel 不适合神经网络训练，但可用于窗口样本抽查。",
    "用列公式构造历史窗口和未来标签，导出为 CSV。",
    "在 Python 训练后把预测结果回填 Excel 做业务复盘。",
  ],
  ensemble: [
    "把多个模型预测放在 C,D,E 列。",
    "等权：`=AVERAGE(C2:E2)`。",
    "加权：若权重在 H1:H3，`=SUMPRODUCT(C2:E2,$H$1:$H$3)`。",
    "对比加权前后 WAPE/MAE 变化。",
  ],
  hierarchical: [
    "先在底层表计算每个 SKU 预测值。",
    "汇总层用 `SUMIFS` 聚合验证总量。",
    "TopDown 时先算历史占比，再用 `总量*占比` 下钻。",
    "检查所有层级合计是否闭环一致。",
  ],
  inventory: [
    "分类结果列放有货概率 `p`，另一列放非零均值 `mu`。",
    "期望需求列：`=p*mu`。",
    "订货建议列：`=MAX(0,期望需求+安全库存-在库)`。",
    "按服务水平阈值分层（高、中、低风险）。",
  ],
};

const FAMILY_PYTHON_REFERENCE_CODE: Record<string, string> = {
  baseline: `import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import Naive, SeasonalNaive, RandomWalkWithDrift

def run_baseline_models(df: pd.DataFrame, horizon: int = 14, freq: str = "D", season_length: int = 7):
  frame = df[["unique_id", "ds", "y"]].copy()
  frame["ds"] = pd.to_datetime(frame["ds"])

  sf = StatsForecast(
    models=[
      Naive(),
      SeasonalNaive(season_length=season_length),
      RandomWalkWithDrift(),
    ],
    freq=freq,
  )
  return sf.forecast(df=frame, h=horizon)
`,
  statistical: `import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, AutoETS, AutoTheta
from statsmodels.tsa.holtwinters import ExponentialSmoothing

def run_statistical_family(df: pd.DataFrame, horizon: int = 14, freq: str = "D", season_length: int = 7):
  frame = df[["unique_id", "ds", "y"]].copy()
  frame["ds"] = pd.to_datetime(frame["ds"])

  sf = StatsForecast(
    models=[
      AutoARIMA(season_length=season_length),
      AutoETS(season_length=season_length),
      AutoTheta(season_length=season_length),
    ],
    freq=freq,
  )
  sf_forecast = sf.forecast(df=frame, h=horizon)

  # 用 StatsModels 显式跑一条序列的 Holt-Winters（加法/乘法）作对照。
  one_series = frame.loc[frame["unique_id"] == frame["unique_id"].iloc[0], "y"].astype(float).to_numpy()
  hw_add = ExponentialSmoothing(
    one_series,
    trend="add",
    seasonal="add",
    seasonal_periods=season_length,
    damped_trend=True,
  ).fit(optimized=True).forecast(horizon)
  hw_mul = ExponentialSmoothing(
    one_series,
    trend="add",
    seasonal="mul",
    seasonal_periods=season_length,
    damped_trend=True,
  ).fit(optimized=True).forecast(horizon)

  return {
    "statsforecast_auto_models": sf_forecast,
    "statsmodels_holt_winters_add": hw_add,
    "statsmodels_holt_winters_mul": hw_mul,
  }
`,
  intermittent: `import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import CrostonClassic, CrostonSBA, TSB

def run_intermittent_models(df: pd.DataFrame, horizon: int = 14, freq: str = "D"):
  frame = df[["unique_id", "ds", "y"]].copy()
  frame["ds"] = pd.to_datetime(frame["ds"])

  sf = StatsForecast(
    models=[
      CrostonClassic(),
      CrostonSBA(),
      TSB(),
    ],
    freq=freq,
  )
  return sf.forecast(df=frame, h=horizon)
`,
  ml: `import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.sort_values("ds").copy()
    df["lag_1"] = df["y"].shift(1)
    df["lag_7"] = df["y"].shift(7)
    df["roll_mean_7"] = df["y"].shift(1).rolling(7).mean()
    df["dayofweek"] = pd.to_datetime(df["ds"]).dt.dayofweek
    return df.dropna().reset_index(drop=True)

def recursive_forecast(frame: pd.DataFrame, horizon: int = 14) -> np.ndarray:
    feat = build_features(frame)
    x_cols = ["lag_1", "lag_7", "roll_mean_7", "dayofweek"]
    model = RandomForestRegressor(n_estimators=300, max_depth=10, random_state=42, n_jobs=-1)
    model.fit(feat[x_cols], feat["y"])

    history = feat["y"].to_list()
    preds = []
    base_date = pd.to_datetime(frame["ds"].max())
    for h in range(1, horizon + 1):
        next_date = base_date + pd.Timedelta(days=h)
        lag_1 = history[-1]
        lag_7 = history[-7] if len(history) >= 7 else history[0]
        roll = float(np.mean(history[-7:])) if len(history) >= 7 else float(np.mean(history))
        x_next = np.array([[lag_1, lag_7, roll, next_date.dayofweek]], dtype=float)
        y_hat = float(model.predict(x_next)[0])
        history.append(y_hat)
        preds.append(y_hat)
    return np.array(preds, dtype=float)
`,
    deep: `import pandas as pd
  from neuralforecast import NeuralForecast
  from neuralforecast.models import LSTM, NBEATS, NHITS

  def run_deep_models(df: pd.DataFrame, horizon: int = 14, freq: str = "D"):
    frame = df[["unique_id", "ds", "y"]].copy()
    frame["ds"] = pd.to_datetime(frame["ds"])

    models = [
      LSTM(h=horizon, input_size=2 * horizon, max_steps=300),
      NBEATS(h=horizon, input_size=2 * horizon, max_steps=300),
      NHITS(h=horizon, input_size=2 * horizon, max_steps=300),
    ]

    nf = NeuralForecast(models=models, freq=freq)
    nf.fit(df=frame)
    return nf.predict()
  `,
    ensemble: `import numpy as np
  from sklearn.ensemble import VotingRegressor

  def equal_weight_average(pred_matrix: np.ndarray) -> np.ndarray:
    # pred_matrix shape: [n_models, horizon]
    return np.mean(pred_matrix, axis=0)

  def weighted_average(pred_matrix: np.ndarray, errors: np.ndarray) -> np.ndarray:
    inv = 1.0 / np.maximum(errors, 1e-8)
    weights = inv / np.sum(inv)
    return (pred_matrix.T @ weights).astype(float)

  def build_voting_regressor(estimators):
    # estimators: [("rf", rf_model), ("xgb", xgb_model), ...]
    return VotingRegressor(estimators=estimators)
  `,
    hierarchical: `from hierarchicalforecast.core import HierarchicalReconciliation
  from hierarchicalforecast.methods import BottomUp, TopDown, MinTrace

  def reconcile_forecasts(base_forecasts, summing_matrix, tags):
    recon = HierarchicalReconciliation(
      reconcilers=[
        BottomUp(),
        TopDown(method="average_proportions"),
        MinTrace(method="ols"),
      ]
    )
    return recon.reconcile(Y_hat_df=base_forecasts, S=summing_matrix, tags=tags)
  `,
  inventory: `import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

def expected_demand_from_stock(frame: pd.DataFrame, horizon: int = 14) -> np.ndarray:
    # frame columns: ds, y
    df = frame.sort_values("ds").copy()
    df["lag_1"] = df["y"].shift(1)
    df["lag_7"] = df["y"].shift(7)
    df["is_in_stock"] = (df["y"] > 0).astype(int)
    feat = df.dropna().reset_index(drop=True)

    x = feat[["lag_1", "lag_7"]].to_numpy(dtype=float)
    y_cls = feat["is_in_stock"].to_numpy(dtype=int)

    clf = RandomForestClassifier(n_estimators=300, max_depth=8, random_state=42, n_jobs=-1)
    clf.fit(x, y_cls)

    avg_non_zero = float(feat.loc[feat["y"] > 0, "y"].mean()) if (feat["y"] > 0).any() else 0.0
    history = feat["y"].to_list()
    preds = []
    for _ in range(horizon):
        lag_1 = history[-1]
        lag_7 = history[-7] if len(history) >= 7 else history[0]
        p = float(clf.predict_proba(np.array([[lag_1, lag_7]], dtype=float))[0, 1])
        y_hat = p * avg_non_zero
        history.append(y_hat)
        preds.append(y_hat)
    return np.array(preds, dtype=float)
`,
};

const MODEL_MATH_WORKFLOW: Record<string, string[]> = {
  AutoETS: [
    "步骤1：先固定季节长度 $m$（日频常见 $m=7$），准备候选结构 AAA 与 AAM。",
    "步骤2：调用 `AutoETS` 自动比较候选结构，按验证误差选择最优结构。",
    "步骤3：若选中 AAA（加法季节），仅使用加法更新链递推 $\\ell_t,b_t,s_t$。",
    "步骤4：若选中 AAM（乘法季节），仅使用乘法更新链递推 $\\ell_t,b_t,s_t$。",
    "步骤5：若启用阻尼趋势，用 $\\phi$ 对趋势累加项衰减，抑制远期过冲。",
    "步骤6：按选中结构输出 $h$ 步预测，并统一用 MAE/RMSE/MAPE/sMAPE/WAPE/MASE 复核。",
  ],
  InStockClassifier: [
    "先训练分类器估计 $P(in\\_stock|x)$。",
    "估计非零需求均值 $\\mu=E(y|y>0)$。",
    "最终预测采用 $ExpectedDemand=P(in\\_stock|x)\\times\\mu$。",
    "该值可直接进入补货点计算。",
  ],
};

const MODEL_EXCEL_WORKFLOW: Record<string, string[]> = {
  InStockClassifier: [
    "C列写有货概率 p，D列写非零均值 mu。",
    "E列期望需求：`=C2*D2`。",
    "F列补货建议：`=MAX(0,E2+安全库存-在库)`。",
  ],
};

const MODEL_PYTHON_REFERENCE_CODE: Record<string, string> = {
  AutoETS: `import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsforecast import StatsForecast
from statsforecast.models import AutoETS

def statsmodels_holt_winters_add(df: pd.DataFrame, horizon: int = 14, season_length: int = 7):
  y = df.sort_values("ds")["y"].astype(float).to_numpy()
  fit = ExponentialSmoothing(
    y,
    trend="add",
    seasonal="add",
    seasonal_periods=season_length,
    damped_trend=True,
  ).fit(optimized=True)
  return fit.forecast(horizon)

def statsmodels_holt_winters_mul(df: pd.DataFrame, horizon: int = 14, season_length: int = 7):
  y = df.sort_values("ds")["y"].astype(float).to_numpy()
  fit = ExponentialSmoothing(
    y,
    trend="add",
    seasonal="mul",
    seasonal_periods=season_length,
    damped_trend=True,
  ).fit(optimized=True)
  return fit.forecast(horizon)

def statsforecast_autoets(df: pd.DataFrame, horizon: int = 14, season_length: int = 7):
  frame = df[["unique_id", "ds", "y"]].copy()
  frame["ds"] = pd.to_datetime(frame["ds"])

  sf = StatsForecast(models=[AutoETS(season_length=season_length)], freq="D")
  return sf.forecast(df=frame, h=horizon)
`,
  InStockClassifier: `import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

def reproduce_instock(frame: pd.DataFrame, horizon: int = 14):
    df = frame.sort_values("ds").copy()
    df["lag_1"] = df["y"].shift(1)
    df["lag_7"] = df["y"].shift(7)
    df["is_in_stock"] = (df["y"] > 0).astype(int)
    train = df.dropna().reset_index(drop=True)

    clf = RandomForestClassifier(n_estimators=300, max_depth=8, random_state=42, n_jobs=-1)
    clf.fit(train[["lag_1", "lag_7"]], train["is_in_stock"])

    mu = float(train.loc[train["y"] > 0, "y"].mean()) if (train["y"] > 0).any() else 0.0
    history = train["y"].tolist()
    out = []
    for _ in range(horizon):
        lag_1 = history[-1]
        lag_7 = history[-7] if len(history) >= 7 else history[0]
        p = float(clf.predict_proba(np.array([[lag_1, lag_7]], dtype=float))[0, 1])
        y_hat = p * mu
        history.append(y_hat)
        out.append({"p_in_stock": p, "expected_demand": y_hat})
    return out
`,
};

const COMMON_REPRODUCIBILITY_CHECKLIST = [
  "固定随机种子（建议 random_seed=42），保证多次运行可重复。",
  "固定数据切分方式：最后 horizon 作为回测窗口，不随意改动。",
  "记录数据版本、参数版本、指标版本，保证结果可追溯。",
  "冠军模型必须同时优于基线模型，避免“看起来很复杂但没增益”。",
  "上线前至少回放最近 2-3 个业务周期，验证稳定性。",
];

const MODEL_FORMULA_PARAMETERS: Record<string, FormulaParameter[]> = {
  AutoETS: [
    { symbol: "\\alpha", meaning: "水平平滑参数", businessValueGuide: "越大越强调最新观测，越小越平滑。" },
    { symbol: "\\beta", meaning: "趋势平滑参数", businessValueGuide: "控制趋势更新速度，波动大时建议偏小。" },
    { symbol: "\\gamma", meaning: "季节平滑参数", businessValueGuide: "控制季节项更新速度。" },
    { symbol: "\\phi", meaning: "阻尼趋势系数", businessValueGuide: "0<phi<=1，phi 越小远期趋势衰减越快。" },
    { symbol: "m", meaning: "季节长度", businessValueGuide: "日频常用 7，月频常用 12。" },
  ],
  Drift: [
    { symbol: "y_t", meaning: "最新需求", businessValueGuide: "取最近一期已确认销量。" },
    { symbol: "y_1", meaning: "起点需求", businessValueGuide: "取训练窗口第一期销量。" },
    { symbol: "h", meaning: "预测步长", businessValueGuide: "按业务滚动周期设置。" },
    { symbol: "(y_t-y_1)/(t-1)", meaning: "单位时间趋势斜率", businessValueGuide: "表示平均每期变化量。" },
  ],
  MovingAverage: [
    { symbol: "w", meaning: "窗口长度", businessValueGuide: "常用 7/14/28，与业务节奏一致。" },
    { symbol: "y_{t-i}", meaning: "窗口内历史需求", businessValueGuide: "必须是已发生的真实销量。" },
    { symbol: "y_hat(t+1)", meaning: "下一期预测", businessValueGuide: "可作为短期补货建议。" },
  ],
  AutoARIMA: [
    { symbol: "p,d,q", meaning: "ARIMA 非季节阶数", businessValueGuide: "由自动搜索或人工候选集确定。" },
    { symbol: "phi(L), theta(L)", meaning: "AR/MA 多项式", businessValueGuide: "描述序列自相关结构。" },
    { symbol: "c", meaning: "常数项", businessValueGuide: "反映整体需求均值水平。" },
  ],
  Prophet: [
    { symbol: "g(t)", meaning: "趋势项", businessValueGuide: "反映长期增长或衰减。" },
    { symbol: "s(t)", meaning: "季节项", businessValueGuide: "捕获周季节、年季节等重复模式。" },
    { symbol: "h(t)", meaning: "节假日项", businessValueGuide: "可导入营销活动或节假日计划。" },
  ],
  InStockClassifier: [
    { symbol: "P(in_stock|x)", meaning: "有货概率", businessValueGuide: "用于评估供给风险。" },
    { symbol: "AvgNonZeroDemand", meaning: "非零需求均值", businessValueGuide: "在有需求样本上统计。" },
    { symbol: "ExpectedDemand", meaning: "期望需求", businessValueGuide: "用于补货量建议和订货点计算。" },
  ],
};

const MODEL_OVERRIDES: Record<
  string,
  {
    overview: string;
    logic?: string[];
    formula?: string[];
    example?: string[];
    links: ExternalReference[];
    tips?: string[];
    paramNotes?: Record<string, string>;
    formulaParameters?: FormulaParameter[];
    pythonWorkflow?: PythonWorkflowStep[];
    mathWorkflow?: string[];
    manualCalculationSteps?: string[];
    excelWorkflow?: string[];
    pythonReferenceCode?: string;
    reproducibilityChecklist?: string[];
  }
> = {
  Naive: {
    overview: "使用最后一个观测值作为未来所有时点预测，最简单且常用的业务基准。",
    links: [{ label: "Naive method", url: "https://otexts.com/fpp3/simple-methods.html#naive-method" }],
  },
  SeasonalNaive: {
    overview: "按季节周期重复历史模式，适合周内或月内稳定重复场景。",
    links: [{ label: "Seasonal naive method", url: "https://otexts.com/fpp3/simple-methods.html#seasonal-naive-method" }],
  },
  Drift: {
    overview: "按首尾趋势线性外推未来需求，适合缓慢单向变化序列。",
    links: [{ label: "Drift method", url: "https://otexts.com/fpp3/simple-methods.html#drift-method" }],
  },
  MovingAverage: {
    overview: "使用最近窗口均值做预测，能平滑短期噪声。",
    links: [{ label: "Moving average", url: "https://en.wikipedia.org/wiki/Moving_average" }],
  },
  AutoARIMA: {
    overview: "自动搜索 ARIMA 结构，建模自相关与差分后的平稳关系。",
    links: [
      { label: "ARIMA chapter", url: "https://otexts.com/fpp3/arima.html" },
      { label: "StatsForecast docs", url: "https://nixtlaverse.nixtla.io/statsforecast/" },
    ],
  },
  AutoETS: {
    overview: "霍尔特-温特（ETS）模型：可在加法/乘法季节结构间自动选择，并支持阻尼趋势，适合平滑型与季节型序列。",
    logic: [
      "通过水平（level）、趋势（trend）、季节（season）三个状态递推更新。",
      "可在加法季节（A,A,A）和乘法季节（A,A,M）之间比较并择优。",
      "阻尼趋势可抑制远期外推过冲，提升中长期预测稳定性。",
    ],
    pythonWorkflow: [
      { step: "步骤1：准备序列", detail: "按 ds 升序，确认 season_length（如日频 7）。" },
      { step: "步骤2：调用函数包", detail: "用 statsmodels.ExponentialSmoothing 或 statsforecast.AutoETS 训练。" },
      { step: "步骤3：比较结构", detail: "至少比较 additive 与 multiplicative 季节结构。" },
      { step: "步骤4：输出预测", detail: "生成 horizon 期预测并保存 level/trend/season 状态解释。" },
      { step: "步骤5：验算指标", detail: "按 MAE/RMSE/MAPE/sMAPE/WAPE/MASE 统一复核。" },
    ],
    paramNotes: {
      alpha: "水平更新权重，越大越看重最新观测。",
      beta: "趋势更新权重，越大越敏感于趋势变化。",
      gamma: "季节更新权重，越大季节响应越快。",
      season_length: "季节周期长度，日频通常 7。",
      damped_trend: "是否使用阻尼趋势，避免远期预测过快发散。",
      phi: "阻尼系数，0<phi<=1，越小衰减越快。",
      trend: "趋势形式（add/mul/None）。",
      seasonal: "季节形式（add/mul/None）。",
    },
    links: [
      { label: "ETS chapter", url: "https://otexts.com/fpp3/expsmooth.html" },
      { label: "Statsmodels ExponentialSmoothing", url: "https://www.statsmodels.org/stable/generated/statsmodels.tsa.holtwinters.ExponentialSmoothing.html" },
      { label: "StatsForecast AutoETS", url: "https://nixtlaverse.nixtla.io/statsforecast/src/core/models.html#autoets" },
    ],
  },
  AutoTheta: {
    overview: "Theta 方法对趋势序列表现稳定，常见于竞赛与工业基线。",
    links: [{ label: "Theta model background", url: "https://otexts.com/fpp3/theta.html" }],
  },
  MSTL: {
    overview: "多季节 STL 分解，适合同时存在周季节和年季节等复杂场景。",
    links: [{ label: "STL and decomposition", url: "https://otexts.com/fpp3/stl.html" }],
  },
  TBATS: {
    overview: "支持复杂多季节与 Box-Cox 转换，常用于复杂周期数据。",
    links: [{ label: "Complex seasonality (TBATS)", url: "https://otexts.com/fpp3/complexseasonality.html" }],
  },
  Prophet: {
    overview: "趋势+季节+节假日加法框架，适合业务快速部署与解释。",
    links: [{ label: "Prophet documentation", url: "https://facebook.github.io/prophet/" }],
  },
  SARIMAX: {
    overview: "带季节项与状态空间估计的 ARIMA 扩展，可接入外生变量。",
    links: [{ label: "Statsmodels SARIMAX", url: "https://www.statsmodels.org/stable/generated/statsmodels.tsa.statespace.sarimax.SARIMAX.html" }],
  },
  DynamicRegression: {
    overview: "动态回归结合 ARIMA 误差项，用于解释变量驱动需求预测。",
    links: [{ label: "Dynamic regression", url: "https://otexts.com/fpp3/dynamic.html" }],
  },
  CrostonClassic: {
    overview: "经典 Croston，将间隔与需求量分开平滑，适合间歇需求。",
    links: [{ label: "Croston method", url: "https://en.wikipedia.org/wiki/Croston_method" }],
  },
  CrostonSBA: {
    overview: "SBA 是 Croston 的偏差修正版本，常用于提升稳定性。",
    links: [{ label: "Croston SBA background", url: "https://openforecast.org/tag/intermittent-demand/" }],
  },
  TSB: {
    overview: "TSB 同时平滑需求发生概率和需求规模，能处理需求衰减。",
    links: [{ label: "TSB method overview", url: "https://openforecast.org/tag/intermittent-demand/" }],
  },
  ADIDA: {
    overview: "先聚合后拆分，降低稀疏噪声对预测器的影响。",
    links: [{ label: "ADIDA overview", url: "https://openforecast.org/tag/intermittent-demand/" }],
  },
  IMAPA: {
    overview: "多层聚合平均策略，增强间歇需求场景的鲁棒性。",
    links: [{ label: "IMAPA overview", url: "https://openforecast.org/tag/intermittent-demand/" }],
  },
  LinearRegression: {
    overview: "线性回归利用滞后特征做需求映射，简单高效且便于解释。",
    links: [{ label: "LinearRegression", url: "https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LinearRegression.html" }],
  },
  Ridge: {
    overview: "Ridge 在回归损失中加入 L2 正则，缓解共线性和过拟合。",
    links: [{ label: "Ridge", url: "https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html" }],
  },
  Lasso: {
    overview: "Lasso 通过 L1 正则实现稀疏特征选择，适合高维特征场景。",
    links: [{ label: "Lasso", url: "https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Lasso.html" }],
  },
  ElasticNet: {
    overview: "ElasticNet 融合 L1 与 L2 正则，兼顾稳定性与稀疏性。",
    links: [{ label: "ElasticNet", url: "https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.ElasticNet.html" }],
  },
  RandomForest: {
    overview: "随机森林通过多树投票拟合非线性关系，鲁棒性较高。",
    links: [{ label: "RandomForestRegressor", url: "https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html" }],
  },
  XGBoost: {
    overview: "XGBoost 梯度提升树在结构化特征场景通常精度较高。",
    links: [{ label: "XGBoost docs", url: "https://xgboost.readthedocs.io/" }],
  },
  LightGBM: {
    overview: "LightGBM 训练速度快，适合大规模特征和样本场景。",
    links: [{ label: "LightGBM docs", url: "https://lightgbm.readthedocs.io/" }],
  },
  CatBoost: {
    overview: "CatBoost 对类别特征处理友好，泛化稳定。",
    links: [{ label: "CatBoost docs", url: "https://catboost.ai/en/docs/" }],
  },
  LSTM: {
    overview: "LSTM 通过门控机制捕获长时依赖，适合长期波动序列。",
    links: [{ label: "LSTM paper", url: "https://arxiv.org/abs/1402.1128" }],
  },
  NBEATS: {
    overview: "N-BEATS 采用纯前馈残差堆叠结构，兼顾精度与可解释分解。",
    links: [{ label: "N-BEATS paper", url: "https://arxiv.org/abs/1905.10437" }],
  },
  NHITS: {
    overview: "N-HiTS 面向多尺度时间结构，兼顾速度与精度。",
    links: [{ label: "N-HiTS paper", url: "https://arxiv.org/abs/2201.12886" }],
  },
  TFT: {
    overview: "TFT 使用注意力和门控结构，擅长多变量时序场景。",
    links: [{ label: "TFT paper", url: "https://arxiv.org/abs/1912.09363" }],
  },
  PatchTST: {
    overview: "PatchTST 把序列分片后用 Transformer 建模，适合长序列。",
    links: [{ label: "PatchTST paper", url: "https://arxiv.org/abs/2211.14730" }],
  },
  Informer: {
    overview: "Informer 通过稀疏注意力降低长序列 Transformer 复杂度。",
    links: [{ label: "Informer paper", url: "https://arxiv.org/abs/2012.07436" }],
  },
  DeepAR: {
    overview: "DeepAR 学习概率分布预测，适合不确定性管理。",
    links: [{ label: "DeepAR paper", url: "https://arxiv.org/abs/1704.04110" }],
  },
  TimesNet: {
    overview: "TimesNet 通过频域-时域联合建模提取多周期模式。",
    links: [{ label: "TimesNet paper", url: "https://arxiv.org/abs/2210.02186" }],
  },
  EnsembleMean: {
    overview: "对成功模型做简单平均，降低单模型偶然误差。",
    links: [{ label: "Forecast combinations", url: "https://otexts.com/fpp3/combinations.html" }],
  },
  EnsembleWeighted: {
    overview: "按历史误差反比加权组合，强调高质量基模型。",
    links: [{ label: "Weighted combinations", url: "https://otexts.com/fpp3/combinations.html" }],
  },
  BottomUpReconciliation: {
    overview: "先预测底层序列再汇总到上层，保证层级一致。",
    links: [{ label: "Bottom-up reconciliation", url: "https://otexts.com/fpp3/hierarchical.html" }],
  },
  TopDownReconciliation: {
    overview: "先预测总量再按历史占比分配到底层。",
    links: [{ label: "Top-down reconciliation", url: "https://otexts.com/fpp3/hierarchical.html" }],
  },
  MinTReconciliation: {
    overview: "通过协方差信息做最小方差一致化重分配。",
    links: [{ label: "MinT reconciliation", url: "https://otexts.com/fpp3/hierarchical.html" }],
  },
  InStockClassifier: {
    overview: "先预测有货概率，再映射为期望需求，直接服务库存策略。",
    links: [
      { label: "RandomForestClassifier", url: "https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html" },
      { label: "Intermittent demand context", url: "https://openforecast.org/tag/intermittent-demand/" },
    ],
    logic: [
      "把 y>0 作为有货标签训练分类器，输出未来每期有货概率。",
      "再用 有货概率 × 历史非零需求均值 得到期望需求。",
      "可与安全库存阈值联合，用于缺货风险分层管控。",
    ],
    formula: [
      "$$P(in\\_stock|x)=\\frac{1}{B}\\sum_b I(T_b(x)=1)$$",
      "$$ExpectedDemand=P(in\\_stock|x)\\times AvgNonZeroDemand$$",
    ],
    example: [
      "例：100 棵树中 73 棵投票“有货”，则 P(in_stock)=0.73。",
      "若历史非零均值 42，则期望需求 = 0.73 * 42 = 30.66。",
    ],
    paramNotes: {
      n_estimators: "分类树数量，影响概率估计稳定性。",
      max_depth: "树深度，过深可能使概率过拟合。",
    },
  },
};

const MODEL_FORMULAS: Record<string, string[]> = {
  Naive: ["$$\\hat{y}_{t+h}=y_t$$"],
  SeasonalNaive: ["$$\\hat{y}_{t+h}=y_{t+h-mk}$$"],
  Drift: ["$$\\hat{y}_{t+h}=y_t+h\\cdot\\frac{y_t-y_1}{t-1}$$"],
  MovingAverage: ["$$\\hat{y}_{t+1}=\\frac{1}{w}\\sum_{i=0}^{w-1}y_{t-i}$$"],
  AutoARIMA: ["$$(1-\\phi(L))(1-L)^d y_t=c+(1+\\theta(L))\\varepsilon_t$$"],
  AutoETS: [
    "$$\\ell_t=\\alpha(y_t-s_{t-m})+(1-\\alpha)(\\ell_{t-1}+b_{t-1})$$",
    "$$b_t=\\beta(\\ell_t-\\ell_{t-1})+(1-\\beta)b_{t-1}$$",
    "$$s_t=\\gamma(y_t-\\ell_t)+(1-\\gamma)s_{t-m}\\;\\text{(additive)}$$",
    "$$s_t=\\gamma\\left(\\frac{y_t}{\\ell_t}\\right)+(1-\\gamma)s_{t-m}\\;\\text{(multiplicative)}$$",
    "$$\\hat{y}_{t+h}=\\ell_t+h\\cdot b_t+s_{t+h-m(k+1)}\\;\\text{(additive seasonality)}$$",
    "$$\\hat{y}_{t+h}=(\\ell_t+h\\cdot b_t)\\cdot s_{t+h-m(k+1)}\\;\\text{(multiplicative seasonality)}$$",
    "$$\\hat{y}_{t+h}=\\ell_t+b_t\\sum_{j=1}^{h}\\phi^j+s_{t+h-m(k+1)}\\;\\text{(damped trend)}$$",
  ],
  AutoTheta: ["$$\\hat{y}=0.5\\,\\Theta(0)+0.5\\,\\Theta(2)$$"],
  MSTL: ["$$y_t=T_t+\\sum_j S_{j,t}+R_t$$"],
  TBATS: ["$$y_t^{(\\omega)}=\\ell_{t-1}+\\phi b_{t-1}+\\sum_j s_{j,t-1}+d_t$$"],
  Prophet: ["$$y(t)=g(t)+s(t)+h(t)+\\varepsilon_t$$"],
  SARIMAX: ["$$\\Phi(L)\\Phi_s(L^m)(1-L)^d(1-L^m)^Dy_t=\\beta^T x_t+\\Theta(L)\\Theta_s(L^m)\\varepsilon_t$$"],
  DynamicRegression: ["$$y_t=\\beta^T x_t+n_t,\\quad n_t\\sim ARIMA(p,d,q)$$"],
  CrostonClassic: ["$$\\hat{z}_t=\\alpha z_t+(1-\\alpha)\\hat{z}_{t-1},\\;\\hat{p}_t=\\alpha p_t+(1-\\alpha)\\hat{p}_{t-1},\\;\\hat{y}=\\hat{z}_t/\\hat{p}_t$$"],
  CrostonSBA: ["$$\\hat{y}_{SBA}=\\left(1-\\frac{\\alpha}{2}\\right)\\frac{\\hat{z}_t}{\\hat{p}_t}$$"],
  TSB: ["$$\\hat{p}_t=\\beta I_t+(1-\\beta)\\hat{p}_{t-1},\\;\\hat{z}_t=\\alpha z_t+(1-\\alpha)\\hat{z}_{t-1},\\;\\hat{y}=\\hat{p}_t\\hat{z}_t$$"],
  ADIDA: ["$$Y_k=\\sum_{i=1}^{m}y_i,\\quad \\hat{y}=\\hat{Y}/m$$"],
  IMAPA: ["$$\\hat{y}=\\frac{1}{K}\\sum_{k=1}^{K}\\hat{y}^{(k)}$$"],
  LinearRegression: ["$$\\hat{y}=w^Tx+b$$"],
  Ridge: ["$$\\min_w \\|y-Xw\\|_2^2+\\lambda\\|w\\|_2^2$$"],
  Lasso: ["$$\\min_w \\|y-Xw\\|_2^2+\\lambda\\|w\\|_1$$"],
  ElasticNet: ["$$\\min_w \\|y-Xw\\|_2^2+\\lambda\\left(\\rho\\|w\\|_1+\\frac{1-\\rho}{2}\\|w\\|_2^2\\right)$$"],
  RandomForest: ["$$\\hat{y}=\\frac{1}{B}\\sum_{b=1}^{B}T_b(x)$$"],
  XGBoost: ["$$\\hat{y}^{(t)}=\\hat{y}^{(t-1)}+\\eta f_t(x)$$"],
  LightGBM: ["$$\\hat{y}^{(t)}=\\hat{y}^{(t-1)}+\\eta f_t(x)$$"],
  CatBoost: ["$$\\hat{y}^{(t)}=\\hat{y}^{(t-1)}+\\eta f_t^{ordered}(x)$$"],
  LSTM: ["$$i_t=\\sigma(W_i[h_{t-1},x_t]),\\;f_t=\\sigma(W_f[h_{t-1},x_t]),\\;c_t=f_t\\odot c_{t-1}+i_t\\odot\\tilde{c}_t,\\;h_t=o_t\\odot\\tanh(c_t)$$"],
  NBEATS: ["$$[x_{backcast},\\hat{y}_{forecast}]=B_\\theta(x_{input})$$"],
  NHITS: ["$$\\hat{y}=\\sum_k Upsample(B_{\\theta_k}(x^{downsampled}))$$"],
  TFT: ["$$Attention(Q,K,V)=softmax\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$"],
  PatchTST: ["$$\\hat{y}=Transformer(PatchEmbed(x))$$"],
  Informer: ["$$ProbSparseAttention(Q,K,V)$$"],
  DeepAR: ["$$y_t\\sim p(y_t|\\theta_t),\\quad \\theta_t=RNN(\\theta_{t-1},x_t,y_{t-1})$$"],
  TimesNet: ["$$\\hat{y}=Time2DConv(FFT(x))$$"],
  EnsembleMean: ["$$\\hat{y}=\\frac{1}{N}\\sum_i\\hat{y}_i$$"],
  EnsembleWeighted: ["$$\\hat{y}=\\sum_i w_i\\hat{y}_i,\\quad w_i\\propto\\frac{1}{error_i}$$"],
  BottomUpReconciliation: ["$$\\hat{y}_{total}=S\\hat{y}_{bottom}$$"],
  TopDownReconciliation: ["$$\\hat{y}_{bottom}=p\\hat{y}_{total}$$"],
  MinTReconciliation: ["$$\\hat{y}_{rec}=S(S^T W^{-1}S)^{-1}S^T W^{-1}\\hat{y}_{base}$$"],
  InStockClassifier: ["$$ExpectedDemand=P(in\\_stock|x)\\times AvgNonZeroDemand$$"],
};

const MODEL_EXAMPLES: Record<string, string[]> = {
  Naive: ["例：昨天销量=128，预测未来 7 天都先取 128。"],
  SeasonalNaive: ["例：season_length=7，预测下周周一直接使用上周周一销量（如 142）。"],
  Drift: ["例：首日=100、最近=130、跨度 30 天，则日斜率约 1，预测 3 天后约 133。"],
  MovingAverage: ["例：window=3，最近三天 [120,132,126]，下一天预测=(120+132+126)/3=126。"],
  AutoARIMA: ["例：自动搜索后得到 (p,d,q)=(1,1,1)，据此滚动预测未来 14 天。"],
  AutoETS: ["例：检测到趋势+周季节，模型把 level/trend/season 叠加后输出下一周预测。"],
  AutoTheta: ["例：在趋势明显序列中，Theta(0) 给长期趋势，Theta(2) 给短期变化，最后加权。"],
  MSTL: ["例：日频数据同时有周季节和月内节奏，分解后分别建模再重组预测。"],
  TBATS: ["例：门店小时级序列有日周期+周周期，TBATS 用三角季节项共同拟合。"],
  Prophet: ["例：趋势项+周季节项+春节假日项叠加，节前预测自动抬升。"],
  SARIMAX: ["例：加入价格作为外生变量，涨价 5% 时模型给出对应需求下调。"],
  DynamicRegression: ["例：把促销/温度做回归项，残差再交给 ARIMA 捕获时序相关。"],
  CrostonClassic: ["例：非零需求均值 z_hat=12，间隔 p_hat=4 天，则日均预测约 3。"],
  CrostonSBA: ["例：alpha=0.2 时，SBA 修正系数为 0.9，预测值=0.9*(z_hat/p_hat)。"],
  TSB: ["例：p_hat=0.25、z_hat=20，则预测需求=0.25*20=5。"],
  ADIDA: ["例：按 7 天聚合后预测下周总量 70，再反聚合为每天 10。"],
  IMAPA: ["例：分别按 7 天和14 天聚合预测 [70,84]，折算日均后取平均得到 11。"],
  LinearRegression: ["例：x=[lag1=120, lag7=95]，w=[0.6,0.3], b=5，则 y_hat=0.6*120+0.3*95+5=105.5。"],
  Ridge: ["例：特征强相关时，Ridge 的 L2 惩罚让权重更平滑，预测更稳定。"],
  Lasso: ["例：20 个特征里仅 6 个权重非零，被自动做了特征选择。"],
  ElasticNet: ["例：alpha=0.1,l1_ratio=0.7，同时保留稀疏性与稳定性。"],
  RandomForest: ["例：300 棵树输出 [118,122,...]，最终预测取平均，例如 120.6。"],
  XGBoost: ["例：第 1 轮预测 110，第 2 轮加上残差树后提升到 116，逐轮逼近真实值。"],
  LightGBM: ["例：num_leaves=31 时快速训练，10 万行样本几分钟内完成迭代。"],
  CatBoost: ["例：包含“城市/门店等级”类别特征时，CatBoost 通常比普通 one-hot 更稳。"],
  LSTM: ["例：输入过去 28 天序列，LSTM 输出未来 14 天并保留长期记忆。"],
  NBEATS: ["例：模型块先回溯解释历史，再输出未来分量，最终合成 14 天预测。"],
  NHITS: ["例：先在粗粒度学习长期趋势，再在细粒度补短期波动。"],
  TFT: ["例：促销变量在注意力中权重提升，预测会对活动日更敏感。"],
  PatchTST: ["例：把 96 步序列切成 12 个 patch，Transformer 学习 patch 间依赖后预测下一窗。"],
  Informer: ["例：长序列 720 步时，用 ProbSparse 注意力显著降低计算量。"],
  DeepAR: ["例：输出的不只是点值，还能给 90% 预测区间用于安全库存。"],
  TimesNet: ["例：把周/月周期映射到频域后提取主频，再回到时域生成预测。"],
  EnsembleMean: ["例：三个模型预测 [120,126,123]，平均后为 123。"],
  EnsembleWeighted: ["例：误差越小权重越高，如权重 [0.5,0.3,0.2]，加权预测更稳。"],
  BottomUpReconciliation: ["例：SKU1=300, SKU2=500, SKU3=200，汇总层自动为 1000。"],
  TopDownReconciliation: ["例：总层预测 1000，历史占比 50/30/20，分配后为 500/300/200。"],
  MinTReconciliation: ["例：利用误差协方差矩阵后，底层调整更小且总层一致性不变。"],
  InStockClassifier: ["例：有货概率 0.82、非零均值 36，则期望需求 29.52。"],
};

function mergeParamNotes(model: ModelCatalogItem, extra?: Record<string, string>) {
  const notes: Record<string, string> = {};
  const keySet = new Set<string>([
    ...Object.keys(model.default_params ?? {}),
    ...Object.keys(model.tunable_params ?? {}),
    ...Object.keys(extra ?? {}),
  ]);

  for (const key of keySet) {
    if (extra?.[key]) {
      notes[key] = extra[key];
      continue;
    }
    if (COMMON_PARAM_NOTES[key]) {
      notes[key] = COMMON_PARAM_NOTES[key];
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(model.default_params ?? {}, key)) {
      notes[key] = "该参数由模型实现定义，建议结合业务周期与验证集效果调节。";
    } else {
      notes[key] = "该参数用于自动调参搜索，请结合耗时预算设置搜索范围。";
    }
  }

  return notes;
}

export function getModelKnowledge(model: ModelCatalogItem): ModelKnowledge {
  const familyDefault =
    FAMILY_DEFAULT[model.family] ??
    FAMILY_DEFAULT.baseline;

  const override = MODEL_OVERRIDES[model.model_name];
  const familyFormulaParameters =
    FAMILY_FORMULA_PARAMETERS[model.family] ?? FAMILY_FORMULA_PARAMETERS.baseline;
  const familyPythonWorkflow =
    FAMILY_PYTHON_WORKFLOW[model.family] ?? FAMILY_PYTHON_WORKFLOW.baseline;
  const familyFunctionPackages =
    FAMILY_FUNCTION_PACKAGES[model.family] ?? FAMILY_FUNCTION_PACKAGES.baseline;
  const familyUpdateEquations =
    FAMILY_UPDATE_EQUATIONS[model.family] ?? FAMILY_UPDATE_EQUATIONS.baseline;
  const familyMathWorkflow =
    FAMILY_MATH_WORKFLOW[model.family] ?? FAMILY_MATH_WORKFLOW.baseline;
  const familyManualCalculationSteps =
    FAMILY_MANUAL_CALCULATION_STEPS[model.family] ?? FAMILY_MANUAL_CALCULATION_STEPS.baseline;
  const familyExcelWorkflow =
    FAMILY_EXCEL_WORKFLOW[model.family] ?? FAMILY_EXCEL_WORKFLOW.baseline;
  const familyPythonReferenceCode =
    FAMILY_PYTHON_REFERENCE_CODE[model.family] ?? FAMILY_PYTHON_REFERENCE_CODE.baseline;

  return {
    overview: override?.overview ?? familyDefault.overview,
    logic: override?.logic ?? familyDefault.logic,
    functionPackages:
      MODEL_FUNCTION_PACKAGES[model.model_name] ??
      familyFunctionPackages,
    formula: override?.formula ?? MODEL_FORMULAS[model.model_name] ?? familyDefault.formula,
    updateEquations:
      MODEL_UPDATE_EQUATIONS[model.model_name] ??
      familyUpdateEquations,
    formulaParameters:
      override?.formulaParameters ??
      MODEL_FORMULA_PARAMETERS[model.model_name] ??
      familyFormulaParameters,
    mathWorkflow:
      override?.mathWorkflow ??
      MODEL_MATH_WORKFLOW[model.model_name] ??
      familyMathWorkflow,
    manualCalculationSteps:
      override?.manualCalculationSteps ??
      MODEL_MANUAL_CALCULATION_STEPS[model.model_name] ??
      familyManualCalculationSteps,
    example: override?.example ?? MODEL_EXAMPLES[model.model_name] ?? familyDefault.example,
    pythonWorkflow: override?.pythonWorkflow ?? familyPythonWorkflow,
    pythonReferenceCode:
      override?.pythonReferenceCode ??
      MODEL_PYTHON_REFERENCE_CODE[model.model_name] ??
      familyPythonReferenceCode,
    excelWorkflow:
      override?.excelWorkflow ??
      MODEL_EXCEL_WORKFLOW[model.model_name] ??
      familyExcelWorkflow,
    reproducibilityChecklist:
      override?.reproducibilityChecklist ?? COMMON_REPRODUCIBILITY_CHECKLIST,
    tips: override?.tips ?? familyDefault.tips,
    links: override?.links ?? familyDefault.links,
    paramNotes: mergeParamNotes(model, override?.paramNotes),
  };
}
