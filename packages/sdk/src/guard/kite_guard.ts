/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/kite_guard.json`.
 */
export type KiteGuard = {
  "address": "8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs",
  "metadata": {
    "name": "kiteGuard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Kite Execution Guard: trustless recurring investment execution on Solana"
  },
  "instructions": [
    {
      "name": "closePlan",
      "docs": [
        "Cancel a recurring plan and reclaim the account rent lamports back to the owner."
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
      "name": "createPlan",
      "docs": [
        "Create a guarded recurring investment plan with validated target weights."
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
      "name": "executeSwap",
      "docs": [
        "Cranker entrypoint. Executes a scheduled recurring purchase period.",
        "Checks elapsed time intervals, advances plan state, and records execution."
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
    },
    {
      "name": "swapExecuted",
      "discriminator": [
        150,
        166,
        26,
        225,
        28,
        89,
        38,
        79
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Funding amount must be greater than zero."
    },
    {
      "code": 6001,
      "name": "invalidPeriods",
      "msg": "Total periods must be greater than zero."
    },
    {
      "code": 6002,
      "name": "periodTooShort",
      "msg": "Period interval is too short."
    },
    {
      "code": 6003,
      "name": "invalidOutputsCount",
      "msg": "Outputs must contain between 1 and 20 assets."
    },
    {
      "code": 6004,
      "name": "invalidAllocationWeights",
      "msg": "Output allocation weights must sum to exactly 10,000 basis points (100%)."
    },
    {
      "code": 6005,
      "name": "calculationOverflow",
      "msg": "Calculation overflow."
    },
    {
      "code": 6006,
      "name": "weightOverflow",
      "msg": "Allocation weights overflowed u16."
    },
    {
      "code": 6007,
      "name": "planAlreadyCompleted",
      "msg": "This recurring plan has already completed all scheduled periods."
    },
    {
      "code": 6008,
      "name": "periodNotElapsed",
      "msg": "Minimum period interval has not elapsed yet."
    },
    {
      "code": 6009,
      "name": "mismatchedFundingMint",
      "msg": "The source token mint does not match the plan funding mint."
    },
    {
      "code": 6010,
      "name": "insufficientFundingCollected",
      "msg": "The guard could not collect enough funding from the subscription."
    },
    {
      "code": 6011,
      "name": "outputDidNotIncrease",
      "msg": "The owner's output token balance did not increase after execution."
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
      "name": "planClosed",
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
            "name": "reclaimedPeriods",
            "type": "u16"
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
            "name": "periods",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "swapExecuted",
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
            "name": "outputMint",
            "type": "pubkey"
          },
          {
            "name": "fundingAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
