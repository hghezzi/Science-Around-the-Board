// src/questionBank.js

// --- SECTION 1: RANDOM EVENTS (MISHAPS) ---
export const LAB_MISHAPS = [
  {
    msg: 'Freezer Failure! (-$100)',
    fact: 'Fun Fact: A -80°C freezer consumes as much energy as an average single-family household.',
  },
  {
    msg: 'Contaminated Reagents! (-$100)',
    fact: "Fun Fact: The 'Kitome' refers to microbial DNA contamination found in sterile DNA extraction kits.",
  },
  {
    msg: 'Pipette Calibration Expired! (-$100)',
    fact: 'Fun Fact: The first micropipette was invented in 1957 by Heinrich Schnitger.',
  },
  {
    msg: "Sample labeled 'Untitled_1' lost! (-$100)",
    fact: 'Fun Fact: Poor metadata is a major reason data become unusable in public repositories.',
  },
  {
    msg: 'Power outage during sequencing! (-$100)',
    fact: 'Fun Fact: An Illumina NovaSeq 6000 can generate up to 6 Tb of data in a single run.',
  },
  {
    msg: 'Spilled the ethanol! (-$100)',
    fact: 'Fun Fact: Residual ethanol can inhibit downstream PCR even at low concentrations.',
  },
  {
    msg: 'Forgot to add polymer! (-$100)',
    fact: 'Fun Fact: Nanopore sequencing measures changes in ionic current as DNA passes through a protein pore.',
  },
  {
    msg: 'Used water instead of buffer! (-$100)',
    fact: 'Fun Fact: EDTA in TE buffer chelates magnesium ions, protecting DNA from nucleases.',
  },
  {
    msg: 'Flow cell overloaded! (-$100)',
    fact: 'Fun Fact: Overclustering causes mixed signals because the camera cannot resolve adjacent DNA clusters.',
  },
  {
    msg: 'Found leftover grant money! (+$50)',
    fact: 'Fun Fact: The NIH invests tens of billions annually in medical research.',
  },
  {
    msg: 'Rebate on sequencing reagents! (+$50)',
    fact: 'Fun Fact: The cost of sequencing a human genome has dropped from ~100M USD to under 1000 USD.',
  },
  {
    msg: 'Server space upgraded for free! (+$50)',
    fact: 'Fun Fact: A single microbiome study can generate terabytes of FASTQ files.',
  },
];

// --- SECTION 2: CORE TECH QUESTIONS ---
export const CORE_TECH_QS = {
  Illumina: {
    prompt: 'Which of the following best describes the fundamental principle behind Illumina sequencing technology?',
    options: [
      'It uses reversible dye terminators to sequence by synthesis.',
      'It measures changes in ionic current as DNA passes through a nanopore.',
      'It uses zero-mode waveguides for single-molecule real-time sequencing.',
      'It detects the release of pyrophosphate via a light signal.',
    ],
    answer: 0,
    explanation:
      "Illumina relies on 'Sequencing by Synthesis' using reversible terminator nucleotides, each with a fluorescent tag.",
  },
  Nanopore: {
    prompt: 'What is the primary advantage of Oxford Nanopore sequencing compared to short-read technologies?',
    options: [
      'It generates the highest accuracy reads of any platform.',
      'It produces ultra-long reads, often exceeding 100 kb.',
      'It yields the highest total data output per dollar invested.',
      'It requires absolutely no computational power for base calling.',
    ],
    answer: 1,
    explanation:
      'Nanopore can sequence long native DNA strands, enabling resolution of structural variation and complex regions.',
  },
  PacBio: {
    prompt:
      'How does Pacific Biosciences (PacBio) HiFi sequencing achieve high accuracy despite having a high raw error rate?',
    options: [
      'By sequencing only very short fragments.',
      'By using Circular Consensus Sequencing (CCS) to read the same molecule multiple times.',
      'By chemically verifying every base with cleavage.',
      'By amplifying the signal intensity 1000-fold.',
    ],
    answer: 1,
    explanation:
      'CCS reads the same circularized molecule many times and builds a consensus, averaging out random errors.',
  },
  Roche: {
    prompt: 'The now-obsolete Roche 454 sequencing platform relied on detecting which signal?',
    options: [
      'Changes in local pH levels.',
      'Light produced from the release of pyrophosphate (Pyrosequencing).',
      'Changes in electron tunneling currents.',
      'Fluorescent dyes attached to terminators.',
    ],
    answer: 1,
    explanation:
      'Roche 454 used pyrosequencing, where nucleotide incorporation triggers a light-generating reaction.',
  },
};

// --- SECTION 3: MAIN TOPIC BANKS ---
// (Here I keep a shorter manual version; you can restore your full text if desired)
export const TOPIC_BANKS = {
  '16S': {
    Side1: {
      manual:
        'LAB MANUAL: SAMPLE PREP\nKey themes: lysis strategies, DNA yield vs. quality, kit contamination (kitome), PCR artifacts (chimeras).',
      sub1: {
        name: 'Extraction',
        questions: [
          {
            prompt: 'Which extraction method is generally most effective for Gram-positive bacteria, and why?',
            options: [
              'Chemical lysis only, because it is gentle.',
              'Mechanical bead beating, because it physically disrupts the thick cell wall.',
              'Heat shock, because it makes the membrane porous.',
              'Ethanol precipitation, because it purifies the DNA.',
            ],
            answer: 1,
            explanation:
              'Gram-positive bacteria have thick peptidoglycan walls; bead beating provides the necessary physical disruption.',
          },
          {
            prompt: "What is a 'chimera' in the context of 16S rRNA gene amplification?",
            options: [
              'A hybrid artifact sequence formed from two different templates.',
              'A viral DNA sequence integrated into a host genome.',
              'A primer-dimer artifact caused by low template concentration.',
              'A sequencing error at the adapter ligation site.',
            ],
            answer: 0,
            explanation:
              'When partially extended amplicons anneal to a different template in the next cycle, they create hybrid sequences.',
          },
        ],
      },
      sub2: {
        name: 'Quality Control',
        questions: [
          {
            prompt:
              "In low-biomass microbiome studies, why is the inclusion of a 'negative control' scientifically critical?",
            options: [
              'To measure total DNA concentration in the final library.',
              'To identify kitome contaminants that could be mistaken for signal.',
              'To calibrate flow cell optics.',
              'To increase observed diversity.',
            ],
            answer: 1,
            explanation:
              'Extraction kits contain background DNA; negatives help identify taxa that may be reagent contaminants.',
          },
          {
            prompt: 'When assessing DNA purity, what does a 260/280 ratio of ~1.8 indicate?',
            options: [
              'Heavy RNA contamination.',
              'Significant protein contamination.',
              'Relatively pure DNA.',
              'Severe DNA shearing.',
            ],
            answer: 2,
            explanation:
              'A 260/280 ratio near 1.8 is the usual benchmark for relatively pure DNA with low protein contamination.',
          },
        ],
      },
      quiz: [
        {
          prompt: 'If your extracted DNA sample shows a 260/280 ratio of 1.4, what is the most likely contaminant?',
          options: ['High RNA', 'Residual protein', 'High salt', 'Pure DNA'],
          answer: 1,
          explanation: 'Low 260/280 ratios often indicate protein or phenol contamination.',
        },
        {
          prompt: 'What is the primary risk associated with using too many PCR cycles during library preparation?',
          options: [
            'Higher fidelity sequences.',
            'More chimeras and amplification bias.',
            'Longer reads.',
            'Reduced DNA yield.',
          ],
          answer: 1,
          explanation: 'Later PCR cycles favor chimera formation and skew amplification efficiency between templates.',
        },
      ],
    },
    Side2: {
      manual:
        'LAB MANUAL: SEQUENCING\nKey themes: cluster generation, sequencing by synthesis, phasing/pre-phasing, PhiX spike-in.',
      sub1: {
        name: 'Library Prep',
        questions: [
          {
            prompt: 'Why is the V4 region (~250 bp) commonly targeted for Illumina 16S sequencing?',
            options: [
              'It is the only variable region.',
              'It produces the longest possible reads.',
              'Its size allows full overlap of paired-end reads.',
              'It encodes antibiotic resistance genes.',
            ],
            answer: 2,
            explanation:
              'Typical read lengths (2x150, 2x250) can fully overlap V4, helping denoising and consensus building.',
          },
          {
            prompt: "What is the primary function of an index (barcode) read?",
            options: [
              'Taxonomic identification.',
              'Allowing multiplexing of many samples in one run.',
              'Calibrating laser intensity.',
              'Acting as a primer binding site.',
            ],
            answer: 1,
            explanation:
              'Indices uniquely label libraries so many samples can be sequenced together and demultiplexed afterward.',
          },
        ],
      },
      sub2: {
        name: 'Sequencing',
        questions: [
          {
            prompt: "What phenomenon causes 'phasing' errors during an Illumina run?",
            options: [
              'Molecules in a cluster losing synchrony in extension.',
              'Laser overheating the flow cell.',
              'Barcode mismatch during demux.',
              'Formation of primer dimers.',
            ],
            answer: 0,
            explanation:
              'When some strands lag or jump ahead in incorporation, the cluster no longer emits a clean single-base signal.',
          },
        ],
      },
      quiz: [
        {
          prompt: 'A Phred Q30 corresponds roughly to what error probability?',
          options: ['1/10', '1/100', '1/1000', '1/10,000'],
          answer: 2,
          explanation: 'Q30 ≈ 0.1% error → 1 in 1000 bases incorrect.',
        },
        {
          prompt: 'Why is a PhiX spike-in added to some 16S runs?',
          options: [
            'To increase diversity for cluster calibration.',
            'To chemically stabilize DNA.',
            'To act as a negative control.',
            'To reduce reagent cost.',
          ],
          answer: 0,
          explanation:
            'Amplicon runs can be low diversity; PhiX provides a balanced base composition for effective image registration.',
        },
      ],
    },
    Side3: {
      manual:
        'LAB MANUAL: BIOINFORMATICS\nKey themes: denoising vs OTU clustering, ASVs, FASTQ structure, taxonomy assignment.',
      sub1: {
        name: 'Processing',
        questions: [
          {
            prompt: 'What is the primary advantage of using DADA2 over 97% OTU clustering?',
            options: [
              'It is always faster.',
              'It distinguishes true sequence variants from errors (ASVs).',
              'It uses less RAM.',
              'It does not require quality scores.',
            ],
            answer: 1,
            explanation:
              'DADA2 models the error process and infers true biological sequences, rather than grouping at 97% identity.',
          },
          {
            prompt: 'In a standard FASTQ file, what is on the 4th line of each record?',
            options: ['Sequence letters', 'Header', 'Quality scores', 'Metadata'],
            answer: 2,
            explanation:
              'FASTQ structure: line1 header, line2 sequence, line3 "+", line4 ASCII-encoded quality scores.',
          },
        ],
      },
      sub2: {
        name: 'Taxonomy',
        questions: [
          {
            prompt: 'Which reference database is often considered the gold standard for 16S taxonomy?',
            options: ['GenBank', 'SILVA', 'UniProt', 'Pfam'],
            answer: 1,
            explanation:
              'SILVA is curated for ribosomal RNA sequences and commonly used in microbiome work.',
          },
        ],
      },
      quiz: [
        {
          prompt: 'What does an Amplicon Sequence Variant (ASV) represent?',
          options: [
            'A 97% OTU cluster.',
            'An inferred exact biological sequence.',
            'A genus-level classification.',
            'A predicted functional gene.',
          ],
          answer: 1,
          explanation:
            'ASVs represent denoised sequences believed to match the true underlying DNA in the sample.',
        },
      ],
    },
    Side4: {
      manual:
        'LAB MANUAL: ECOLOGICAL STATS\nKey themes: alpha/beta diversity, PCoA, compositionality, FDR corrections.',
      sub1: {
        name: 'Normalization',
        questions: [
          {
            prompt: 'Why is rarefaction sometimes used before computing diversity?',
            options: [
              'To remove rare species.',
              'To normalize uneven sequencing depth across samples.',
              'To increase sample size artificially.',
              'To log-transform counts.',
            ],
            answer: 1,
            explanation:
              'Rarefaction subsamples counts to a common depth, making comparisons less dominated by read depth.',
          },
          {
            prompt: 'Which alpha diversity metric accounts for both richness and evenness?',
            options: ['Jaccard', 'Shannon', 'Bray-Curtis', 'Unweighted UniFrac'],
            answer: 1,
            explanation:
              'Shannon index weights species by their relative abundances as well as richness.',
          },
        ],
      },
      sub2: {
        name: 'Diversity',
        questions: [
          {
            prompt: 'What does beta diversity measure?',
            options: [
              'Number of species in a single sample.',
              'Differences in composition between samples.',
              'Evenness of species distribution.',
              'Total biomass.',
            ],
            answer: 1,
            explanation:
              'Beta diversity captures differences between communities rather than within a single one.',
          },
        ],
      },
      quiz: [
        {
          prompt: 'Why is microbiome data called "compositional"?',
          options: [
            'Because it is composed of bacteria.',
            'Because counts are constrained to a constant total (relative abundance).',
            'Because it is normally distributed.',
            'Because species are independent.',
          ],
          answer: 1,
          explanation:
            'Relative abundances sum to a constant; an increase in one taxon necessarily changes others.',
        },
      ],
    },
  },
  SHOTGUN: {
    Side1: { manual: 'Shotgun Prep Concept', sub1: { name: 'Prep', questions: [] }, sub2: { name: 'Host', questions: [] }, quiz: [] },
    Side2: { manual: 'Sequencing Concept', sub1: { name: 'Seq', questions: [] }, sub2: { name: 'Run', questions: [] }, quiz: [] },
    Side3: { manual: 'Assembly Concept', sub1: { name: 'Assembly', questions: [] }, sub2: { name: 'Binning', questions: [] }, quiz: [] },
    Side4: { manual: 'Profiling Concept', sub1: { name: 'Functional', questions: [] }, sub2: { name: 'Stats', questions: [] }, quiz: [] },
  },
};

// --- PRE / POST SURVEYS (minimal version, you can extend) ---
export const PRE_SURVEY = {
  sliders: [
    { id: 'conf16S', label: 'Confidence with 16S amplicon analysis' },
    { id: 'confShotgun', label: 'Confidence with shotgun metagenomics' },
    { id: 'confStats', label: 'Confidence with microbiome statistics' },
  ],
  questions: [
    {
      prompt: 'Which region is commonly targeted for general 16S surveys on Illumina?',
      options: ['V1–V3', 'V4', 'V6–V8', 'ITS'],
      answer: 1,
    },
    {
      prompt: 'What does a Q30 base quality score mean?',
      options: ['1% error', '0.1% error', '10% error', '0.01% error'],
      answer: 1,
    },
    {
      prompt: 'Which database is specialized for 16S rRNA taxonomy?',
      options: ['UniProt', 'SILVA', 'Pfam', 'RefSeq Viral'],
      answer: 1,
    },
    {
      prompt: 'Which metric is a measure of within-sample diversity?',
      options: ['Shannon index', 'Bray-Curtis distance', 'UniFrac', 'PCoA axis 1'],
      answer: 0,
    },
    {
      prompt: 'What is one key drawback of rarefaction?',
      options: [
        'It inflates alpha diversity.',
        'It discards valid reads and reduces power.',
        'It overestimates evenness.',
        'It cannot be applied to large datasets.',
      ],
      answer: 1,
    },
    {
      prompt: 'Which file format typically stores raw read sequences and qualities?',
      options: ['FASTA', 'FASTQ', 'BAM', 'VCF'],
      answer: 1,
    },
    {
      prompt: 'What does DADA2 primarily try to model?',
      options: ['PCR efficiency only', 'Sequencing error process', 'Host contamination', 'Phylogenetic relationships'],
      answer: 1,
    },
  ],
};

// Does not have "correct" answer to avoid students seeing grade
export const POST_SURVEY = {
  sliders: PRE_SURVEY.sliders,
  questions: [
    {
      prompt: 'You observe many mitochondrial ASVs in your data. What is the most likely explanation?',
      options: [
        'A novel bacterial phylum.',
        'Host contamination in the sample.',
        'PCR failure.',
        'Overclustering on the sequencer.',
      ],},
    {
      prompt: 'Which distance metric incorporates phylogenetic information?',
      options: ['Bray-Curtis', 'Jaccard', 'UniFrac', 'Euclidean'],},
    {
      prompt: 'When might you prefer long-read sequencing (PacBio/Nanopore) over Illumina short reads?',
      options: [
        'When only SNP calling is needed.',
        'When resolving complex structural variation or assemblies.',
        'When you have extremely low biomass.',
        'When you only need taxonomic profiles.',
      ],},
    {
      prompt: 'Which processing step is crucial to avoid inflated taxa from artificial recombination?',
      options: ['Trimming adapters', 'Chimera removal', 'Base calling', 'Barcode demultiplexing'],},
    {
      prompt: 'Which plot would you use to visualize between-sample differences in composition?',
      options: ['Alpha rarefaction curve', 'PCoA plot', 'Volcano plot', 'Histogram of read lengths'],},
    {
      prompt: 'Why must multiple hypothesis testing corrections (like FDR) be applied in differential abundance?',
      options: [
        'To increase sample size.',
        'To control the rate of false positives across many features.',
        'To remove outliers.',
        'To equalize sequencing depth.',
      ],},
    {
      prompt: 'In compositional data, a naive correlation between taxa may be misleading because:',
      options: [
        'Sequencers are not quantitative.',
        'Relative abundances are constrained and introduce spurious associations.',
        'Taxa are phylogenetically related.',
        'Taxa share similar GC content.',
      ],},
  ],
};

// --- CHAOS CODE CHALLENGES (for property-stealing) ---
export const CHAOS_CODE_CHALLENGES = [
  {
    id: 'r_phyloseq_bug',
    language: 'R',
    prompt: 'You get an error running this code. What is the bug?',
    code: `physeq <- qza_to_phyloseq(feature_table, taxonomy)
plot_richness(ps) + geom_boxplot()`,
    options: [
      'The object should be "ps" not "physeq".',
      'plot_richness cannot be combined with geom_boxplot.',
      'qza_to_phyloseq does not return a phyloseq object.',
      'feature_table must be numeric.',
    ],
    answer: 0,
    explanation: 'You created "physeq" but then tried to plot an object named "ps".',
  },
  {
    id: 'r_dplyr_pipe',
    language: 'R',
    prompt: 'What is wrong with the following code?',
    code: `df %>%
  group_by(Group)
  summarize(mean_abundance = mean(abundance))`,
    options: [
      'summarize must be written as summarise in all locales.',
      'There is a missing pipe (%>%) before summarize.',
      'group_by cannot be used with summarize.',
      'mean_abundance must be precomputed.',
    ],
    answer: 1,
    explanation:
      'After group_by, you need another %>% before summarize: group_by(Group) %>% summarize(...).',
  },
  {
    id: 'qiime_import',
    language: 'bash',
    prompt: 'A QIIME2 user gets an error with this command. What is likely wrong?',
    code: `qiime tools import \
  --type 'SampleData[SequencesWithQuality]' \
  --input-path table.qza \
  --input-format SingleEndFastqManifestPhred33V2 \
  --output-path demux.qza`,
    options: [
      'table.qza is not a raw FASTQ manifest; it is a feature table artifact.',
      'The type should be FeatureTable[Frequency].',
      'The output path must end with .qzv.',
      'SequencesWithQuality cannot be imported.',
    ],
    answer: 0,
    explanation:
      'SampleData[SequencesWithQuality] expects raw reads; table.qza is a feature table, not a manifest or raw data.',
  },
];
