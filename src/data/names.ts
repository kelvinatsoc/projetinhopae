// Nomes para jogadores gerados (novos talentos da base, "regens").
import { pick, pickWeighted, rand } from "../engine/rng";

const BR_FIRST = [
  "Gabriel", "Lucas", "Matheus", "Pedro", "Guilherme", "Rafael", "Gustavo", "Felipe", "João", "Vitor",
  "Bruno", "Thiago", "Leonardo", "Rodrigo", "Diego", "Eduardo", "André", "Carlos", "Daniel", "Marcos",
  "Caio", "Igor", "Wesley", "Kauã", "Davi", "Arthur", "Enzo", "Bernardo", "Nicolas", "Samuel",
  "Breno", "Ryan", "Yuri", "Luan", "Luiz", "Henrique", "Murilo", "Vinícius", "Renan", "Willian",
  "Everton", "Erick", "Kaio", "Allan", "Alisson", "Anderson", "Fabrício", "Fernando", "Hugo", "Ítalo",
  "Jean", "Jefferson", "Jorge", "José", "Júlio", "Kevin", "Marcelo", "Maurício", "Nathan", "Otávio",
  "Paulo", "Patrick", "Ramon", "Ricardo", "Robson", "Sérgio", "Talles", "Wallace", "Weverton", "Wellington",
  "Douglas", "Emerson", "Fábio", "Jonathan", "Kayky", "Kauan", "Luciano", "Mateus", "Natan", "Pablo",
  "Raí", "Rian", "Ruan", "Sávio", "Tiago", "Yago", "Alexandre", "Cauê", "Danilo", "Elias",
  "Gerson", "Heitor", "Iago", "Jhonatan", "Lázaro", "Miguel", "Nícolas", "Rogério", "Valdir", "Wagner",
];

const BR_LAST = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Ferreira", "Costa", "Rodrigues", "Almeida",
  "Nascimento", "Alves", "Carvalho", "Araújo", "Ribeiro", "Gomes", "Martins", "Rocha", "Barbosa", "Melo",
  "Cardoso", "Teixeira", "Dias", "Moreira", "Nunes", "Mendes", "Freitas", "Vieira", "Monteiro", "Moura",
  "Batista", "Correia", "Campos", "Castro", "Pinto", "Ramos", "Lopes", "Machado", "Fernandes", "Andrade",
  "Reis", "Farias", "Cavalcanti", "Pires", "Bezerra", "Sales", "Miranda", "Brito", "Nogueira", "Tavares",
  "Xavier", "Queiroz", "Sampaio", "Porto", "Leite", "Duarte", "Fonseca", "Macedo", "Peixoto", "Siqueira",
  "Bastos", "Coelho", "Guimarães", "Toledo", "Prado", "Aguiar", "Matos", "Paixão", "Galvão", "Rezende",
];

const BR_COMPOUND = [
  "João Pedro", "Luiz Henrique", "Pedro Henrique", "João Victor", "Carlos Eduardo", "Paulo Henrique",
  "Matheus Henrique", "João Paulo", "Luiz Gustavo", "Gabriel Henrique", "Marcos Vinícius", "Vitor Hugo",
  "Luiz Felipe", "João Lucas", "Pedro Lucas", "Kauã Henrique", "José Victor", "Ruan Pablo", "Davi Luiz",
  "Antônio Carlos", "Victor Gabriel", "Arthur Henrique", "Enzo Gabriel", "Luan Cândido",
];

const BR_DIMINUTIVE: Record<string, string> = {
  Pedro: "Pedrinho", Gabriel: "Gabrielzinho", Paulo: "Paulinho", Marcos: "Marquinhos", Luiz: "Luizinho",
  Fernando: "Fernandinho", Ronaldo: "Ronaldinho", Rafael: "Rafinha", João: "Joãozinho", Lucas: "Luquinhas",
  Thiago: "Thiaguinho", Diego: "Dieguinho", Carlos: "Carlinhos", Ricardo: "Ricardinho", Marcelo: "Marcelinho",
  Daniel: "Danielzinho", Felipe: "Felipinho", Juninho: "Juninho", Anderson: "Andersinho", Bruno: "Bruninho",
};

const BR_NICK = [
  "Dudu", "Tetê", "Dedé", "Nenê", "Bebeto", "Juninho", "Zé Rafael", "Zé Vitor", "Tchê", "Kaká",
  "Biel", "Teteu", "Léo", "Rafa", "Gui", "Caio", "Didi", "Cacá", "Lelê", "Fabinho", "Vitinho",
  "Robinho", "Tiquinho", "Neném", "Pepê", "Tatá", "Wendel", "Duda", "Jajá", "Lulinha",
];

const BR_REGION = ["Baiano", "Paulista", "Carioca", "Mineiro", "Gaúcho", "Paraíba", "Potiguar", "Pernambucano", "Capixaba", "Paraense", "Goiano", "Maranhão"];

const ES_FIRST = [
  "Juan", "Santiago", "Matías", "Nicolás", "Agustín", "Facundo", "Lautaro", "Thiago", "Valentín", "Franco",
  "Joaquín", "Tomás", "Martín", "Sebastián", "Diego", "Lucas", "Emiliano", "Gonzalo", "Ignacio", "Maximiliano",
  "Federico", "Leandro", "Ezequiel", "Brian", "Kevin", "Cristian", "Rodrigo", "Alejandro", "Andrés", "Carlos",
  "Luis", "José", "Jorge", "Miguel", "Pablo", "Gabriel", "Daniel", "Fernando", "Ricardo", "Héctor",
  "Óscar", "Mateo", "Benjamín", "Bruno", "Enzo", "Felipe", "Iván", "Julián", "Marcos", "Ramiro",
];

const ES_FIRST_ANDEAN = [
  "Jhon", "Brayan", "Yerson", "Wilmar", "Duván", "Jhojan", "Stiven", "Kendry", "Byron", "Darwin",
  "Édison", "Freddy", "Jefferson", "Moisés", "Piero", "Renato", "Yoshimar", "Jhonatan", "Anderson", "Cristhian",
  "Alexis", "Jordan", "Jeison", "Yeferson", "Robert", "Ángel", "Carlos", "Luis", "José", "Juan",
];

const ES_LAST = [
  "González", "Rodríguez", "Fernández", "López", "Martínez", "García", "Pérez", "Sánchez", "Romero", "Díaz",
  "Álvarez", "Torres", "Ruiz", "Ramírez", "Flores", "Benítez", "Acosta", "Medina", "Herrera", "Suárez",
  "Aguirre", "Giménez", "Molina", "Silva", "Castro", "Rojas", "Ortiz", "Gutiérrez", "Morales", "Vargas",
  "Peralta", "Ríos", "Cabrera", "Domínguez", "Sosa", "Ramos", "Núñez", "Vera", "Ojeda", "Cáceres",
  "Villalba", "Paredes", "Quintero", "Valencia", "Mina", "Caicedo", "Cuero", "Arboleda", "Angulo", "Montaño",
  "Mosquera", "Palacios", "Cortés", "Quiñónez", "Hurtado", "Mendoza", "Guerrero", "Zambrano", "Bolaños", "Vaca",
  "Saavedra", "Arce", "Rondón", "Figueroa", "Espinoza", "Riquelme", "Ledesma", "Correa", "Galeano", "Duarte",
];

const ANDEAN = new Set(["COL", "ECU", "VEN", "PER", "BOL"]);

/** Gera um nome de jogador de acordo com a nacionalidade. */
export function generateName(nat: string): string {
  if (nat === "BRA" || nat === "POR") return brazilianName();
  const first = ANDEAN.has(nat) && rand() < 0.55 ? pick(ES_FIRST_ANDEAN) : pick(ES_FIRST);
  return `${first} ${pick(ES_LAST)}`;
}

function brazilianName(): string {
  const style = pickWeighted(
    ["full", "compound", "single", "dim", "region", "nick", "last"],
    [36, 14, 15, 8, 6, 9, 12],
  );
  const first = pick(BR_FIRST);
  switch (style) {
    case "compound":
      return pick(BR_COMPOUND);
    case "single":
      return first;
    case "dim":
      return BR_DIMINUTIVE[first] ?? `${first.replace(/[aeo]$/, "")}inho`;
    case "region":
      return `${first} ${pick(BR_REGION)}`;
    case "nick":
      return pick(BR_NICK);
    case "last":
      return pick(BR_LAST);
    default:
      return `${first} ${pick(BR_LAST)}`;
  }
}

/** Nacionalidade de um jogador gerado para um clube de determinado país. */
export function natForClub(country: string): string {
  if (country === "BRA") {
    // a maioria brasileira, com alguns estrangeiros sul-americanos
    return pickWeighted(["BRA", "ARG", "URU", "COL", "PAR", "ECU", "CHI", "VEN", "PER"], [90, 2.5, 2, 1.5, 1.2, 1, 0.8, 0.5, 0.5]);
  }
  if (rand() < 0.08) return pickWeighted(["BRA", "ARG", "URU", "COL", "PAR", "VEN"], [3, 3, 2, 2, 1, 1]);
  return country;
}

/** Etnia aproximada para o gerador de rosto. */
export function raceForNat(nat: string): "white" | "black" | "brown" | "asian" {
  const r = rand();
  switch (nat) {
    case "BRA":
      return r < 0.36 ? "white" : r < 0.74 ? "brown" : "black";
    case "ARG":
    case "URU":
      return r < 0.82 ? "white" : r < 0.97 ? "brown" : "black";
    case "CHI":
    case "PAR":
      return r < 0.45 ? "white" : "brown";
    case "COL":
    case "ECU":
      return r < 0.2 ? "white" : r < 0.62 ? "brown" : "black";
    case "VEN":
      return r < 0.35 ? "white" : r < 0.82 ? "brown" : "black";
    case "PER":
    case "BOL":
      return r < 0.15 ? "white" : r < 0.95 ? "brown" : "black";
    case "JPN":
    case "KOR":
    case "CHN":
      return "asian";
    default:
      return r < 0.55 ? "white" : r < 0.8 ? "brown" : "black";
  }
}
