"""add icd_codes reference table with seed data

Revision ID: 20251020_000008
Revises: 20251020_000007
Create Date: 2025-10-20 00:00:08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column

revision = "20251020_000008"
down_revision = "20251020_000007"
branch_labels = None
depends_on = None

# fmt: off
_SEED = [
    # Diabetes (HCC 17/18/19)
    ("E10.9",  "Type 1 diabetes mellitus without complications",              "18",  "Diabetes without Complications",           [],               ["Consider if complications are documented."]),
    ("E11.9",  "Type 2 diabetes mellitus without complications",              "18",  "Diabetes without Complications",           ["E11.65","E11.42","E11.21","E11.51"], ["Unspecified — select a complication code if documented."]),
    ("E11.65", "Type 2 DM with hyperglycemia",                               "18",  "Diabetes without Complications",           ["E11.9"],         []),
    ("E11.42", "Type 2 DM with diabetic polyneuropathy",                     "18",  "Diabetes without Complications",           ["E11.40","E11.49"],["Requires documentation of neuropathy."]),
    ("E11.40", "Type 2 DM with diabetic neuropathy, unspecified",            "18",  "Diabetes without Complications",           ["E11.42"],        []),
    ("E11.49", "Type 2 DM with other diabetic neurological complication",    "18",  "Diabetes without Complications",           [],               []),
    ("E11.21", "Type 2 DM with diabetic nephropathy",                        "18",  "Diabetes without Complications",           ["E11.22","N18.30"],["Co-code CKD stage if applicable."]),
    ("E11.22", "Type 2 DM with diabetic chronic kidney disease, stage 1–2",  "18",  "Diabetes without Complications",           [],               []),
    ("E11.51", "Type 2 DM with diabetic peripheral angiopathy without gangrene","18","Diabetes without Complications",          [],               []),
    ("E11.52", "Type 2 DM with diabetic peripheral angiopathy with gangrene","17",  "Diabetes with Acute Complications",        [],               ["Gangrene present — higher severity HCC."]),
    ("E11.00", "Type 2 DM with hyperosmolarity without coma",                "17",  "Diabetes with Acute Complications",        [],               []),
    ("E11.01", "Type 2 DM with hyperosmolarity with coma",                   "17",  "Diabetes with Acute Complications",        [],               []),
    ("E11.641","Type 2 DM with hypoglycemia with coma",                      "17",  "Diabetes with Acute Complications",        [],               []),
    # CKD (HCC 136/137/138)
    ("N18.1",  "Chronic kidney disease, stage 1",                            None,  None,                                       ["N18.30"],        []),
    ("N18.2",  "Chronic kidney disease, stage 2 (mild)",                     None,  None,                                       ["N18.30"],        []),
    ("N18.30", "Chronic kidney disease, stage 3 unspecified",                "136", "Chronic Kidney Disease, Moderate (Stage 3)",["N18.31","N18.32"],["Stage 3a or 3b should be coded when known."]),
    ("N18.31", "Chronic kidney disease, stage 3a",                           "136", "Chronic Kidney Disease, Moderate (Stage 3)",["N18.30"],        []),
    ("N18.32", "Chronic kidney disease, stage 3b",                           "136", "Chronic Kidney Disease, Moderate (Stage 3)",["N18.30"],        []),
    ("N18.4",  "Chronic kidney disease, stage 4 (severe)",                   "136", "Chronic Kidney Disease, Moderate (Stage 3)",["N18.5"],         ["Stage 4 — consider nephrology referral."]),
    ("N18.5",  "Chronic kidney disease, stage 5",                            "138", "Chronic Kidney Disease, Severe (Stage 5)",  [],               ["ESRD if on dialysis — code Z99.2 additionally."]),
    ("N18.6",  "End-stage renal disease",                                    "138", "Chronic Kidney Disease, Severe (Stage 5)",  [],               ["Must document dialysis — add Z99.2."]),
    # Heart Failure (HCC 85/86/87)
    ("I50.9",  "Heart failure, unspecified",                                 "85",  "Congestive Heart Failure, Unspecified",    ["I50.20","I50.30"],["Unspecified — specify systolic/diastolic when documented."]),
    ("I50.20", "Unspecified systolic (congestive) heart failure",            "86",  "Systolic Heart Failure",                   ["I50.21","I50.22"],["Specify acute/chronic when known."]),
    ("I50.21", "Acute systolic (congestive) heart failure",                  "86",  "Systolic Heart Failure",                   [],               []),
    ("I50.22", "Chronic systolic (congestive) heart failure",                "86",  "Systolic Heart Failure",                   [],               []),
    ("I50.23", "Acute on chronic systolic (congestive) heart failure",       "86",  "Systolic Heart Failure",                   [],               []),
    ("I50.30", "Unspecified diastolic (congestive) heart failure",           "85",  "Congestive Heart Failure, Unspecified",    ["I50.31","I50.32"],[]),
    ("I50.31", "Acute diastolic (congestive) heart failure",                 "85",  "Congestive Heart Failure, Unspecified",    [],               []),
    ("I50.32", "Chronic diastolic (congestive) heart failure",               "85",  "Congestive Heart Failure, Unspecified",    [],               []),
    # COPD (HCC 111)
    ("J44.0",  "COPD with acute lower respiratory infection",                "111", "Chronic Obstructive Pulmonary Disease",    ["J44.1"],         []),
    ("J44.1",  "COPD with (acute) exacerbation",                             "111", "Chronic Obstructive Pulmonary Disease",    ["J44.0"],         ["Exacerbation documented — code as J44.1."]),
    ("J44.9",  "Chronic obstructive pulmonary disease, unspecified",         "111", "Chronic Obstructive Pulmonary Disease",    ["J44.1"],         ["Specify exacerbation if documented."]),
    # Atrial Fibrillation (HCC 96)
    ("I48.0",  "Paroxysmal atrial fibrillation",                             "96",  "Atrial Fibrillation",                      ["I48.19"],        []),
    ("I48.11", "Longstanding persistent atrial fibrillation",                "96",  "Atrial Fibrillation",                      [],               []),
    ("I48.19", "Other persistent atrial fibrillation",                       "96",  "Atrial Fibrillation",                      [],               []),
    ("I48.20", "Chronic atrial fibrillation, unspecified",                   "96",  "Atrial Fibrillation",                      [],               []),
    ("I48.91", "Unspecified atrial fibrillation",                            "96",  "Atrial Fibrillation",                      ["I48.0","I48.19"],["Specify type when documented."]),
    # Coronary Artery Disease (HCC 88)
    ("I25.10", "Atherosclerotic heart disease of native coronary artery without angina","88","Coronary Artery Disease",         ["I25.110"],       []),
    ("I25.110","Atherosclerotic heart disease with unstable angina",         "88",  "Coronary Artery Disease",                  [],               []),
    ("I25.119","Atherosclerotic heart disease with unspecified angina",      "88",  "Coronary Artery Disease",                  [],               []),
    # Stroke / TIA (HCC 99/100)
    ("I63.9",  "Cerebral infarction, unspecified",                           "99",  "Cerebrovascular Disease, Except Hemorrhage","I63.50",         []),
    ("I63.50", "Cerebral infarction due to unspecified occlusion of artery","99",  "Cerebrovascular Disease, Except Hemorrhage",[],               []),
    ("G45.9",  "Transient cerebral ischemic attack, unspecified",            "99",  "Cerebrovascular Disease, Except Hemorrhage",[],               ["TIA — document fully. Consider I63.9 if infarction confirmed."]),
    # Schizophrenia (HCC 57)
    ("F20.9",  "Schizophrenia, unspecified",                                 "57",  "Schizophrenia",                            ["F20.0","F20.5"], []),
    ("F20.0",  "Paranoid schizophrenia",                                     "57",  "Schizophrenia",                            [],               []),
    ("F20.5",  "Residual schizophrenia",                                     "57",  "Schizophrenia",                            [],               []),
    # Alzheimer's (HCC 52)
    ("G30.9",  "Alzheimer's disease, unspecified",                           "52",  "Dementia with or without Complications",   ["G30.0","G30.1"], []),
    ("G30.0",  "Alzheimer's disease with early onset",                       "52",  "Dementia with or without Complications",   [],               []),
    ("G30.1",  "Alzheimer's disease with late onset",                        "52",  "Dementia with or without Complications",   [],               []),
    ("F02.80", "Dementia in other diseases classified elsewhere, unspecified","52", "Dementia with or without Complications",   ["G30.9"],         ["Use as secondary code with G30.x."]),
    # Parkinson's (HCC 78)
    ("G20",    "Parkinson's disease",                                        "78",  "Parkinson's and Huntington's Diseases",    [],               []),
    # Major Depressive Disorder (HCC 59)
    ("F33.9",  "Major depressive disorder, recurrent, unspecified",          "59",  "Major Depressive, Bipolar, and Paranoid Disorders",["F33.0","F33.1"],[]),
    ("F33.0",  "Major depressive disorder, recurrent, mild",                 "59",  "Major Depressive, Bipolar, and Paranoid Disorders",[],          []),
    ("F33.1",  "Major depressive disorder, recurrent, moderate",             "59",  "Major Depressive, Bipolar, and Paranoid Disorders",[],          []),
    ("F33.2",  "Major depressive disorder, recurrent severe without psychosis","59","Major Depressive, Bipolar, and Paranoid Disorders",[],          []),
    # Obesity (HCC 22)
    ("E66.01", "Morbid (severe) obesity due to excess calories",             "22",  "Morbid Obesity",                           [],               ["BMI ≥ 40 required."]),
    ("E66.09", "Other obesity due to excess calories",                       None,  None,                                       ["E66.01"],        []),
    ("E66.9",  "Obesity, unspecified",                                       None,  None,                                       ["E66.01","E66.09"],["Specify type and BMI."]),
    # Peripheral Vascular Disease (HCC 108)
    ("I73.9",  "Peripheral vascular disease, unspecified",                   "108", "Vascular Disease",                         ["I70.209"],       []),
    ("I70.209","Unspecified atherosclerosis of native arteries of extremities","108","Vascular Disease",                        [],               []),
    # Sepsis (HCC 2/3)
    ("A41.9",  "Sepsis, unspecified organism",                               "2",   "Septicemia, Sepsis, Systemic Inflammatory Response Syndrome",["A41.01","A41.51"],["Identify organism when possible."]),
    ("A41.01", "Sepsis due to methicillin susceptible Staphylococcus aureus","2",   "Septicemia, Sepsis, SIRS",                 [],               []),
    ("A41.51", "Sepsis due to Escherichia coli",                             "2",   "Septicemia, Sepsis, SIRS",                 [],               []),
    # Pneumonia (HCC 114/115)
    ("J18.9",  "Pneumonia, unspecified organism",                            "114", "Aspiration and Specified Bacterial Pneumonias",["J18.0","J15.9"],["Identify organism when possible."]),
    ("J15.9",  "Unspecified bacterial pneumonia",                            "114", "Aspiration and Specified Bacterial Pneumonias",[],              []),
    ("J69.0",  "Pneumonitis due to inhalation of food and vomit",            "114", "Aspiration and Specified Bacterial Pneumonias",[],              ["Aspiration pneumonia — document clearly."]),
    # Pressure Ulcer (HCC 157/158/159)
    ("L89.90", "Pressure ulcer of unspecified site, unspecified stage",      "157", "Chronic Ulcer of Skin, Except Pressure",   [],               ["Stage must be documented."]),
    ("L89.94", "Pressure ulcer of unspecified site, stage 4",                "158", "Pressure Ulcer of Skin, Stage 4",          [],               []),
]
# fmt: on


def upgrade() -> None:
    op.create_table(
        "icd_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(12), nullable=False, unique=True),
        sa.Column("description", sa.String(512), nullable=False),
        sa.Column("hcc_code", sa.String(12), nullable=True),
        sa.Column("hcc_label", sa.String(255), nullable=True),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("alternatives", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("notes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_icd_codes_code", "icd_codes", ["code"])
    op.create_index("ix_icd_codes_hcc_code", "icd_codes", ["hcc_code"])

    icd_table = table(
        "icd_codes",
        column("code", sa.String),
        column("description", sa.String),
        column("hcc_code", sa.String),
        column("hcc_label", sa.String),
        column("category", sa.String),
        column("alternatives", sa.JSON),
        column("notes", sa.JSON),
        column("is_valid", sa.Boolean),
    )

    op.bulk_insert(
        icd_table,
        [
            {
                "code": code,
                "description": desc,
                "hcc_code": hcc,
                "hcc_label": hcc_label,
                "category": None,
                "alternatives": alts,
                "notes": notes,
                "is_valid": True,
            }
            for code, desc, hcc, hcc_label, alts, notes in _SEED
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_icd_codes_hcc_code", table_name="icd_codes")
    op.drop_index("ix_icd_codes_code", table_name="icd_codes")
    op.drop_table("icd_codes")
