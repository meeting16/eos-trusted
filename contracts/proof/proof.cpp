#include <eosio/eosio.hpp>
#include <eosio/crypto.hpp>
#include <eosio/system.hpp>
#include <string>

using namespace eosio;
using namespace std;

class [[eosio::contract("proof")]] proof : public contract {
  public:
      using contract::contract;

      proof(name receiver, name code, datastream<const char*> ds):contract(receiver, code, ds) {}

      [[eosio::action]]
      void addproof(name user, checksum256 datahash, uint32_t block_num, checksum256 block_id) {
          require_auth(user);

          proofs_table proofs(get_self(), get_self().value);
          auto idx = proofs.get_index<"bydatahash"_n>();
          auto existing = idx.find(datahash);
          eosio::check(existing == idx.end(), "Proof already exists");

          proofs.emplace(user, [&](auto& row) {
              row.id = proofs.available_primary_key();
              row.user = user;
              row.datahash = datahash;
              row.block_num = block_num;
              row.block_id = block_id;
              row.timestamp = eosio::current_time_point();
          });
      }

      [[eosio::action]]
      void getproofbyid(uint64_t id) {
          proofs_table proofs(get_self(), get_self().value);
          auto proof_itr = proofs.find(id);
          eosio::check(proof_itr != proofs.end(), "Proof not found");

          printproof(*proof_itr);
      }

      [[eosio::action]]
      void getproof(checksum256 block_id) {
          proofs_table proofs(get_self(), get_self().value);
          auto idx = proofs.get_index<"byblockid"_n>();
          auto proof_itr = idx.find(block_id);
          eosio::check(proof_itr != idx.end(), "Proof not found for given block ID");

          printproof(*proof_itr);
      }

      [[eosio::action]]
      void verifyproof(uint64_t id, checksum256 datahash) {
          proofs_table proofs(get_self(), get_self().value);
          auto proof_itr = proofs.find(id);
          eosio::check(proof_itr != proofs.end(), "Proof not found");

          eosio::check(proof_itr->datahash == datahash, "Datahash does not match");

          print("Data verification successful.\n");
      }

  private:
      struct [[eosio::table]] proof_data {
          uint64_t id;
          name user;
          checksum256 datahash;
          uint32_t block_num;
          checksum256 block_id;
          time_point timestamp;

          uint64_t primary_key() const { return id; }
          const checksum256& by_blockid() const { return block_id; }
          const checksum256& by_datahash() const { return datahash; }
      };

      typedef multi_index<"proofs"_n, proof_data,
          indexed_by<"byblockid"_n, const_mem_fun<proof_data, const checksum256&, &proof_data::by_blockid>>,
          indexed_by<"bydatahash"_n, const_mem_fun<proof_data, const checksum256&, &proof_data::by_datahash>>
      > proofs_table;
/*
      void printproof(const proof_data& p) {
          print("ID: ", p.id, "\n");      
          print("User: ", p.user, "\n");
          print("Datahash: ", p.datahash, "\n");
          print("Block Number: ", p.block_num, "\n");
          print("Block ID: ", p.block_id, "\n");
	  print("Timestamp: ", p.timestamp.sec_since_epoch(), "\n");*/
      void printproof(const proof_data& p) {
    print("{ \"ID\": ", p.id, ", \"User\": \"", p.user, "\", \"Datahash\": \"", p.datahash, "\", \"Block Number\": \"", p.block_num, "\", \"Timestamp\": ", p.timestamp.sec_since_epoch(), ", \"Block ID\": \"", p.block_id, "\" }\n");
	}
	
     // }
};

EOSIO_DISPATCH(proof, (addproof)(getproofbyid)(getproof)(verifyproof))

