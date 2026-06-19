//! Types for chain scanning error handling.

use std::error;
use std::fmt::{self, Debug, Display};
use std::ops::Range;

use zcash_protocol::consensus::BlockHeight;

use crate::scanning::ScanError;

/// Errors related to chain validation and scanning.
#[derive(Debug)]
pub enum Error<WalletError, BlockSourceError> {
    /// An error that was produced by wallet operations in the course of scanning the chain.
    Wallet(WalletError),

    /// An error that was produced by the underlying block data store in the process of validation
    /// or scanning.
    BlockSource(BlockSourceError),

    /// A block that was received violated rules related to chain continuity or contained note
    /// commitments that could not be reconciled with the note commitment tree(s) maintained by the
    /// wallet.
    Scan(ScanError),

    /// An error occurred while scanning a range of blocks. This wraps the underlying error
    /// together with the range of block heights that was being scanned when the error occurred,
    /// so that failures (such as note commitment tree conflicts produced while persisting scanned
    /// blocks) can be diagnosed against the specific range being scanned.
    Range {
        /// The range of block heights (start inclusive, end exclusive) that was being scanned
        /// when the wrapped error occurred.
        block_range: Range<BlockHeight>,
        /// The underlying error.
        cause: Box<Error<WalletError, BlockSourceError>>,
    },
}

impl<WE: fmt::Display, BE: fmt::Display> fmt::Display for Error<WE, BE> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match &self {
            Error::Wallet(e) => {
                write!(
                    f,
                    "The underlying datasource produced the following error: {e}"
                )
            }
            Error::BlockSource(e) => {
                write!(
                    f,
                    "The underlying block store produced the following error: {e}"
                )
            }
            Error::Scan(e) => {
                write!(f, "Scanning produced the following error: {e}")
            }
            Error::Range { block_range, cause } => {
                write!(
                    f,
                    "An error occurred while scanning the block range {}..{}: {cause}",
                    u32::from(block_range.start),
                    u32::from(block_range.end),
                )
            }
        }
    }
}

impl<WE, BE> error::Error for Error<WE, BE>
where
    WE: Debug + Display + error::Error + 'static,
    BE: Debug + Display + error::Error + 'static,
{
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        match &self {
            Error::Wallet(e) => Some(e),
            Error::BlockSource(e) => Some(e),
            Error::Range { cause, .. } => Some(cause.as_ref()),
            _ => None,
        }
    }
}

impl<WE, BSE> From<ScanError> for Error<WE, BSE> {
    fn from(e: ScanError) -> Self {
        Error::Scan(e)
    }
}
