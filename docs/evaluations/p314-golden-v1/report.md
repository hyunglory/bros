# Resolver Evaluation Report

- Dataset: synthetic-golden/v1 (SYNTHETIC)
- Mode: COLLECTED_EVIDENCE_REPLAY
- Calibration: SYNTHETIC_ONLY
- Automatic promotion: OFF
- Dataset SHA-256: 829477c39da19c07c393518697eab8850ecf4fb8e47f51163b2acf9090088505
- Holdout SHA-256: fd7afbf12c21aea1d79fa6ca78ab590d570ab5fafd55eae93b6bd1d2a16672ad
- Algorithm SHA-256: fcb992c94d04614cf07dd42a9b648adc88f3baedf9aab363e29feec22dd05649

| Holdout metric | Value |
|---|---|
| caseCount | 10 |
| masterCount | 10 |
| candidateCount | 10 |
| autoCandidateCount | 1 |
| autoMasterCount | 1 |
| wrongAutoCount | 0 |
| unsafeAutoCount | 0 |
| precision | 1 |
| coverage | 0.1 |
| knownIdentifierCaseCount | 8 |
| missingCorrectCandidateCount | 0 |
| falseReviewCount | 3 |
| falseReviewDenominator | 4 |
| falseReviewRate | 0.75 |
| providerFailureCases | 1 |
| truncatedCases | 1 |
| elapsedMs | 7.575700000000211 |
| p95ReplayMs | 3.513400000000047 |
| costKnownCount | 9 |
| recordedCostUsd | 0 |
| meanRecordedCostUsd | 0 |

## Gate checks

- realLabels: NOT_MET
- distinctProducts: NOT_MET
- tuningSplit: PASS
- holdoutAutoCandidates: NOT_MET
- holdoutAutoProducts: NOT_MET
- brandCoverage: NOT_MET
- categoryCoverage: NOT_MET
- challengeCoverage: PASS
- zeroWrongAuto: PASS
- zeroUnsafeAuto: PASS

## Limits

Evidence replay measures normalization/scoring/conflict/decision only. Provider capture and full Worker runtime are not replayed. Cost is the recorded capture cost; missing cost is not zero. Labels and capture provenance require curator verification. See report.json for split/brand/category denominators, score bins, errors and case outcomes. A passing sample is not a statistical guarantee or authorization to enable automatic promotion.
