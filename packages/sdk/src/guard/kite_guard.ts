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
                "account": "plan"
              },
              {
                "kind": "account",
                "path": "plan.fundingMint",
                "account": "plan"
              },
              {
                "kind": "account",
                "path": "plan.nonce",
                "account": "plan"
              }
            ]
          }
        },
        {
          "name": "fundingMint"
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "rentPayer",
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
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createPlan",
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
              "name": "createPlanData"
            }
          }
        }
      ]
    },
    {
      "name": "executeSwap",
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
                "account": "plan"
              },
              {
                "kind": "account",
                "path": "plan.fundingMint",
                "account": "plan"
              },
              {
                "kind": "account",
                "path": "plan.nonce",
                "account": "plan"
              }
            ]
          }
        },
        {
          "name": "fundingMint",
          "writable": true
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
          "name": "mockMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  99,
                  107,
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
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
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
      "name": "planClosed",
      "discriminator": [
        244,
        135,
        44,
        167,
        104,
        238,
        207,
        12
      ]
    },
    {
      "name": "planCreated",
      "discriminator": [
        215,
        11,
        135,
        121,
        208,
        119,
        149,
        149
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mockMintAuthorityMismatch",
      "msg": "Devnet mock mint authority does not match the program PDA."
    },
    {
      "code": 6001,
      "name": "periodTooShort",
      "msg": "Period interval must be at least 60 seconds."
    },
    {
      "code": 6002,
      "name": "calculationOverflow",
      "msg": "Calculation overflow."
    },
    {
      "code": 6003,
      "name": "periodNotElapsed",
      "msg": "This period is not due or was already executed."
    },
    {
      "code": 6004,
      "name": "outputDidNotIncrease",
      "msg": "Owner output delivery was not verified."
    },
    {
      "code": 6005,
      "name": "unsupportedPlanVersion",
      "msg": "Unsupported plan version."
    },
    {
      "code": 6006,
      "name": "invalidSchedule",
      "msg": "The schedule must be bounded, aligned, and end within one year."
    },
    {
      "code": 6007,
      "name": "invalidOutput",
      "msg": "Outputs require distinct mints and positive minimum deliveries."
    },
    {
      "code": 6008,
      "name": "invalidTokenAccount",
      "msg": "A canonical unfrozen token account is required."
    },
    {
      "code": 6009,
      "name": "invalidDelegation",
      "msg": "Invalid official recurring delegation or authority."
    },
    {
      "code": 6010,
      "name": "delegationTermsMismatch",
      "msg": "The delegation does not match the owner-approved plan terms."
    },
    {
      "code": 6011,
      "name": "fundingDelegateMismatch",
      "msg": "The funding account no longer delegates to Subscriptions."
    },
    {
      "code": 6012,
      "name": "unexpectedPeriod",
      "msg": "The requested period does not match the current schedule window."
    },
    {
      "code": 6013,
      "name": "fundingBalanceMismatch",
      "msg": "Funding balance changes do not match the approved allocation."
    },
    {
      "code": 6014,
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
            "name": "devnetMock",
            "type": "bool"
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
            "name": "version",
            "type": "u8"
          },
          {
            "name": "devnetMock",
            "type": "bool"
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
                  "name": "output"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "planClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "planCreated",
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
    }
  ]
};
