# generate_synthetic_data.py
import pandas as pd
import numpy as np
from faker import Faker

fake = Faker()
n = 1000

claims = pd.DataFrame({
    "MemberID": [f"M{fake.random_int(1000,9999)}" for _ in range(n)],
    "ServiceDate": [fake.date_between('-1y', 'today') for _ in range(n)],
    "ServiceType": np.random.choice(['ER', 'Imaging', 'PrimaryCare', 'Specialist'], n),
    "Cost": np.random.gamma(2, 150, n),
    "ProviderID": [f"P{fake.random_int(100,999)}" for _ in range(n)],
    "AuthorizationStatus": np.random.choice(['Approved', 'Denied', 'Pending'], n)
})

claims.to_csv('claims_data.csv', index=False)