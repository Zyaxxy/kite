// Generated from the Rust Anchor IDL. Run packages/anchor/scripts/sync-idl.cjs.
export type KiteGuard = {
  "address": "8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs",
  "metadata": {
    "name": "kiteGuard",
    "version": "0.2.0",
    "spec": "0.1.0",
    "description": "Kite Execution Guard: trustless recurring investment execution on Solana"
  },
  "instructions": [
    {
      "name": "closePlan",
      "docs": [
        "The legacy owner can still recover rent from an old scaffold plan."
      ],
      "discriminator": [
        45,
        137,
        184,
        220,
        162,
        253,
        161,
        8
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "plan"
          ]
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "plan.fundingMint",
                "account": "plan"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closePlanV2",
      "docs": [
        "Owner-only cancellation revokes the bound grant before closing plan accounts.",
        "Already-revoked grants remain cancellable; incidental staging donations go to owner."
      ],
      "discriminator": [
        47,
        96,
        149,
        187,
        179,
        60,
        69,
        96
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "plan"
          ]
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "plan.fundingMint",
                "account": "planV2"
              },
              {
                "kind": "account",
                "path": "plan.nonce",
                "account": "planV2"
              }
            ]
          }
        },
        {
          "name": "fundingMint"
        },
        {
          "name": "ownerFundingToken",
          "writable": true
        },
        {
          "name": "planFundingToken",
          "writable": true
        },
        {
          "name": "recurringDelegation",
          "writable": true
        },
        {
          "name": "delegationRentPayer",
          "writable": true
        },
        {
          "name": "subscriptionsProgram",
          "address": "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createPlan",
      "docs": [
        "Legacy instruction retained only to reject stale clients explicitly."
      ],
      "discriminator": [
        77,
        43,
        141,
        254,
        212,
        118,
        41,
        186
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "fundingMint"
        },
        {
          "name": "subscriptionAuthority"
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "fundingMint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "data",
          "type": {
            "defined": {
              "name": "createPlanData"
            }
          }
        }
      ]
    },
    {
      "name": "createPlanV2",
      "docs": [
        "Owner approves exact devnet pools, minimum deliveries, and a bounded delegation.",
        "Canonical ATAs and the official delegation must be created earlier in this transaction."
      ],
      "discriminator": [
        37,
        47,
        225,
        32,
        74,
        77,
        255,
        41
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "fundingMint"
        },
        {
          "name": "subscriptionAuthority"
        },
        {
          "name": "recurringDelegation"
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "fundingMint"
              },
              {
                "kind": "arg",
                "path": "data.nonce"
              }
            ]
          }
        },
        {
          "name": "planFundingToken",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "data",
          "type": {
            "defined": {
              "name": "createPlanV2Data"
            }
          }
        }
      ]
    },
    {
      "name": "executeSwap",
      "docs": [
        "Legacy execution never advances counters or emits a successful investment."
      ],
      "discriminator": [
        56,
        182,
        124,
        215,
        155,
        140,
        157,
        102
      ],
      "accounts": [
        {
          "name": "cranker",
          "writable": true,
          "signer": true
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "plan.owner",
                "account": "plan"
              },
              {
                "kind": "account",
                "path": "plan.fundingMint",
                "account": "plan"
              }
            ]
          }
        },
        {
          "name": "subscriptionProgram"
        },
        {
          "name": "subscriptionAuthority"
        },
        {
          "name": "recurringDelegation"
        },
        {
          "name": "sourceToken",
          "writable": true
        },
        {
          "name": "vaultFundingToken",
          "writable": true
        },
        {
          "name": "ownerOutputToken",
          "writable": true
        },
        {
          "name": "outputMint"
        },
        {
          "name": "subscriptionInstruction"
        }
      ],
      "args": [
        {
          "name": "planId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeSwapV2",
      "docs": [
        "One atomic installment: bounded Subscriptions collection, every approved CPMM leg,",
        "then verified owner deliveries. Any error rolls back both programs and all counters."
      ],
      "discriminator": [
        253,
        42,
        122,
        205,
        194,
        255,
        25,
        68
      ],
      "accounts": [
        {
          "name": "feePayer",
          "writable": true,
          "signer": true
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "plan.owner",
                "account": "planV2"
              },
              {
                "kind": "account",
                "path": "plan.fundingMint",
                "account": "planV2"
              },
              {
                "kind": "account",
                "path": "plan.nonce",
                "account": "planV2"
              }
            ]
          }
        },
        {
          "name": "fundingMint"
        },
        {
          "name": "subscriptionAuthority"
        },
        {
          "name": "recurringDelegation",
          "writable": true
        },
        {
          "name": "ownerFundingToken",
          "writable": true
        },
        {
          "name": "planFundingToken",
          "writable": true
        },
        {
          "name": "subscriptionsProgram",
          "address": "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                187,
                199,
                119,
                175,
                186,
                104,
                240,
                18,
                62,
                192,
                196,
                209,
                183,
                238,
                137,
                110,
                147,
                1,
                201,
                41,
                197,
                90,
                6,
                186,
                149,
                24,
                33,
                88,
                37,
                140,
                21,
                169
              ]
            }
          }
        },
        {
          "name": "raydiumProgram",
          "address": "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"
        },
        {
          "name": "raydiumAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  110,
                  100,
                  95,
                  108,
                  112,
                  95,
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  95,
                  115,
                  101,
                  101,
                  100
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                184,
                152,
                153,
                121,
                45,
                202,
                82,
                52,
                121,
                111,
                231,
                116,
                98,
                176,
                49,
                223,
                70,
                63,
                95,
                254,
                174,
                54,
                124,
                92,
                15,
                251,
                36,
                110,
                28,
                183,
                206,
                12
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "expectedPeriod",
          "type": "u16"
        }
      ]
    },
    {
      "name": "protocolVersion",
      "docs": [
        "Read-only release capability probe. No legacy counter-only execution is supported."
      ],
      "discriminator": [
        147,
        149,
        48,
        158,
        234,
        222,
        20,
        181
      ],
      "accounts": [],
      "args": [],
      "returns": "u8"
    }
  ],
  "accounts": [
    {
      "name": "plan",
      "discriminator": [
        161,
        231,
        251,
        119,
        2,
        12,
        162,
        2
      ]
    },
    {
      "name": "planV2",
      "discriminator": [
        131,
        247,
        17,
        37,
        248,
        104,
        208,
        114
      ]
    }
  ],
  "events": [
    {
      "name": "installmentExecuted",
      "discriminator": [
        99,
        16,
        149,
        43,
        56,
        212,
        224,
        67
      ]
    },
    {
      "name": "planClosedV2",
      "discriminator": [
        25,
        159,
        212,
        46,
        235,
        198,
        233,
        61
      ]
    },
    {
      "name": "planCreatedV2",
      "discriminator": [
        92,
        118,
        125,
        72,
        85,
        220,
        33,
        129
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Funding amount must be greater than zero and fund every basket leg."
    },
    {
      "code": 6001,
      "name": "invalidPeriods",
      "msg": "Choose between 1 and 365 periods."
    },
    {
      "code": 6002,
      "name": "periodTooShort",
      "msg": "Period interval must be between 60 seconds and one year."
    },
    {
      "code": 6003,
      "name": "invalidOutputsCount",
      "msg": "Outputs must contain between 1 and 20 assets."
    },
    {
      "code": 6004,
      "name": "invalidAllocationWeights",
      "msg": "Output weights must sum to 10,000 basis points."
    },
    {
      "code": 6005,
      "name": "calculationOverflow",
      "msg": "Calculation overflow."
    },
    {
      "code": 6006,
      "name": "weightOverflow",
      "msg": "Allocation weights overflowed."
    },
    {
      "code": 6007,
      "name": "planAlreadyCompleted",
      "msg": "This plan is completed or expired."
    },
    {
      "code": 6008,
      "name": "periodNotElapsed",
      "msg": "This period is not due or was already executed."
    },
    {
      "code": 6009,
      "name": "mismatchedFundingMint",
      "msg": "The funding mint does not match."
    },
    {
      "code": 6010,
      "name": "insufficientFundingCollected",
      "msg": "The subscription did not collect the full installment."
    },
    {
      "code": 6011,
      "name": "outputDidNotIncrease",
      "msg": "Owner output delivery was not verified."
    },
    {
      "code": 6012,
      "name": "legacyPlanDisabled",
      "msg": "Legacy counter-only plans are disabled; create a version 2 plan."
    },
    {
      "code": 6013,
      "name": "unsupportedPlanVersion",
      "msg": "Unsupported plan version."
    },
    {
      "code": 6014,
      "name": "invalidSchedule",
      "msg": "The schedule must be bounded, aligned, and end within one year."
    },
    {
      "code": 6015,
      "name": "invalidOutput",
      "msg": "Outputs require distinct mints, pools, and positive minimum deliveries."
    },
    {
      "code": 6016,
      "name": "duplicateOutput",
      "msg": "Duplicate output mint or pool."
    },
    {
      "code": 6017,
      "name": "unsupportedTokenProgram",
      "msg": "Only classic SPL tokens are supported on devnet."
    },
    {
      "code": 6018,
      "name": "invalidTokenAccount",
      "msg": "A canonical unfrozen token account is required."
    },
    {
      "code": 6019,
      "name": "invalidAccountData",
      "msg": "Invalid account data."
    },
    {
      "code": 6020,
      "name": "invalidDelegation",
      "msg": "Invalid official recurring delegation or authority."
    },
    {
      "code": 6021,
      "name": "delegationTermsMismatch",
      "msg": "The delegation does not match the owner-approved plan terms."
    },
    {
      "code": 6022,
      "name": "fundingDelegateMismatch",
      "msg": "The funding account no longer delegates to Subscriptions."
    },
    {
      "code": 6023,
      "name": "unexpectedPeriod",
      "msg": "The requested period does not match the current schedule window."
    },
    {
      "code": 6024,
      "name": "fundingBalanceMismatch",
      "msg": "Funding balance changes do not match the approved allocation."
    },
    {
      "code": 6025,
      "name": "minimumOutputNotMet",
      "msg": "A basket leg did not deliver the approved minimum."
    },
    {
      "code": 6026,
      "name": "invalidRouteAccounts",
      "msg": "Provide exactly the approved route accounts for every output."
    },
    {
      "code": 6027,
      "name": "invalidPool",
      "msg": "The pool, mints, vaults or oracle do not match the approved devnet route."
    },
    {
      "code": 6028,
      "name": "invalidRentRecipient",
      "msg": "Delegation rent must return to its original payer."
    },
    {
      "code": 6029,
      "name": "unsupportedFreezeAuthority",
      "msg": "Recurring funding and output mints must have no freeze authority."
    }
  ],
  "types": [
    {
      "name": "createPlanData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fundingAmount",
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "u64"
          },
          {
            "name": "periods",
            "type": "u16"
          },
          {
            "name": "outputs",
            "type": {
              "vec": {
                "defined": {
                  "name": "output"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "createPlanV2Data",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "fundingAmount",
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "u64"
          },
          {
            "name": "startsAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "periods",
            "type": "u16"
          },
          {
            "name": "outputs",
            "type": {
              "vec": {
                "defined": {
                  "name": "outputV2"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "installmentExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "period",
            "type": "u16"
          },
          {
            "name": "fundingAmount",
            "type": "u64"
          },
          {
            "name": "outputAmounts",
            "type": {
              "vec": "u64"
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "output",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "weightBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "outputV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "weightBps",
            "type": "u16"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "minimumAmountOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "plan",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "fundingMint",
            "type": "pubkey"
          },
          {
            "name": "fundingAmount",
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "u64"
          },
          {
            "name": "lastExecutedAt",
            "type": "i64"
          },
          {
            "name": "periods",
            "type": "u16"
          },
          {
            "name": "executedPeriods",
            "type": "u16"
          },
          {
            "name": "subscriptionAuthority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "outputs",
            "type": {
              "vec": {
                "defined": {
                  "name": "output"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "planClosedV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "planCreatedV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "startsAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "planV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "fundingMint",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "fundingAmount",
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "u64"
          },
          {
            "name": "startsAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "periods",
            "type": "u16"
          },
          {
            "name": "executedPeriods",
            "type": "u16"
          },
          {
            "name": "lastExecutedPeriod",
            "type": "u16"
          },
          {
            "name": "lastExecutedAt",
            "type": "i64"
          },
          {
            "name": "subscriptionAuthority",
            "type": "pubkey"
          },
          {
            "name": "recurringDelegation",
            "type": "pubkey"
          },
          {
            "name": "subscriptionInitId",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "outputs",
            "type": {
              "vec": {
                "defined": {
                  "name": "outputV2"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
